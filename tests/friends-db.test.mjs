import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("friend requests and shared products are private, accepted-only, and account-scoped", async t => {
  const db = await PGlite.create();
  t.after(() => db.close());
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table public.account_usernames(
      user_id uuid primary key references auth.users(id) on delete cascade,
      username text unique not null,
      email text not null
    );
    create table public.catalog_products(
      asin text primary key,
      title text not null,
      brand text,
      image_url text,
      product_url text,
      price_cents integer
    );
  `);
  await db.exec(await readFile(
    new URL("../supabase/migrations/20261018082000_friends_and_product_shares.sql", import.meta.url),
    "utf8",
  ));

  const alice = "00000000-0000-4000-8000-000000000001";
  const bob = "00000000-0000-4000-8000-000000000002";
  const carol = "00000000-0000-4000-8000-000000000003";
  await db.query("insert into auth.users(id) values ($1), ($2), ($3)", [alice, bob, carol]);
  await db.query(`insert into public.account_usernames(user_id, username, email)
    values ($1, 'alice_shop', 'alice@example.com'),
           ($2, 'bob_finds', 'bob@example.com'),
           ($3, 'carol_home', 'carol@example.com')`, [alice, bob, carol]);
  await db.query(`insert into public.catalog_products(asin, title, brand, image_url, product_url, price_cents)
    values ('B012345678', 'Desk lamp', 'Bright Home', 'https://img.test/lamp.jpg',
      'https://amazon.com/dp/B012345678', 2500)`);

  await t.test("username search returns a limited public identity and relationship", async () => {
    const found = await db.query(
      "select * from public.search_account_usernames($1, $2, 20)",
      ["bo", alice],
    );
    assert.deepEqual(found.rows, [{
      user_id: bob,
      username: "bob_finds",
      relationship: "none",
    }]);
    const ownSearch = await db.query(
      "select * from public.search_account_usernames($1, $2, 20)",
      ["al", alice],
    );
    assert.deepEqual(ownSearch.rows, []);
    assert.equal(
      await db.query("select has_table_privilege('authenticated', 'public.friend_connections', 'select') as allowed")
        .then(result => result.rows[0].allowed),
      false,
    );
  });

  await t.test("requests are unique, incoming requests are accepted explicitly, and removal works", async () => {
    assert.equal(
      (await db.query("select public.create_friend_request($1, $2) as status", [alice, bob])).rows[0].status,
      "outgoing",
    );
    assert.equal(
      (await db.query("select public.create_friend_request($1, $2) as status", [alice, bob])).rows[0].status,
      "outgoing",
    );
    assert.equal(
      (await db.query("select public.create_friend_request($1, $2) as status", [bob, alice])).rows[0].status,
      "incoming",
    );
    assert.equal(
      (await db.query("select public.respond_friend_request($1, $2, true) as accepted", [bob, alice])).rows[0].accepted,
      true,
    );
    assert.equal(
      (await db.query("select public.remove_friendship($1, $2) as removed", [alice, bob])).rows[0].removed,
      true,
    );
    assert.equal(
      (await db.query("select public.get_friend_data($1) as data", [alice])).rows[0].data.friends.length,
      0,
    );
  });

  await t.test("only accepted friends can share, and recipients receive product details", async () => {
    await assert.rejects(
      db.query("select public.share_product_with_friend($1, $2, $3)", [alice, bob, "B012345678"]),
      /accepted friend/,
    );
    await db.query("select public.create_friend_request($1, $2)", [alice, bob]);
    await db.query("select public.respond_friend_request($1, $2, true)", [bob, alice]);
    const share = await db.query(
      "select public.share_product_with_friend($1, $2, $3) as id",
      [alice, bob, "B012345678"],
    );
    assert.match(share.rows[0].id, /^[0-9a-f-]{36}$/i);
    const data = await db.query("select public.get_friend_data($1) as data", [bob]);
    assert.deepEqual(data.rows[0].data.shares[0], {
      id: share.rows[0].id,
      asin: "B012345678",
      title: "Desk lamp",
      brand: "Bright Home",
      imageUrl: "https://img.test/lamp.jpg",
      productUrl: "https://amazon.com/dp/B012345678",
      priceCents: 2500,
      senderUsername: "alice_shop",
      createdAt: data.rows[0].data.shares[0].createdAt,
    });
    assert.equal(data.rows[0].data.incomingRequests.length, 0);
  });
});
