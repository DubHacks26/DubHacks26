import test from "node:test";
import assert from "node:assert/strict";
import userApi from "../api/user.js";

const userId = "00000000-0000-4000-8000-000000000001";
const friendId = "00000000-0000-4000-8000-000000000002";

function response() {
  return {
    code: 200,
    body: undefined,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request({ query = {}, body = {}, params = {}, data = [], error = null } = {}) {
  const calls = [];
  return {
    calls,
    req: {
      user: { id: userId },
      query,
      body,
      params,
      catalogSupabase: {
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data, error };
        },
      },
    },
  };
}

test("friend search validates prefixes and returns only directory data", async () => {
  const { req, calls } = request({
    query: { query: "sha" },
    data: [{ user_id: friendId, username: "sharon_7", relationship: "none" }],
  });
  const res = response();

  await userApi.handleFriendSearch(req, res);

  assert.deepEqual(res.body.users, [
    { userId: friendId, username: "sharon_7", relationship: "none" },
  ]);
  assert.deepEqual(calls[0], {
    name: "search_account_usernames",
    args: { p_prefix: "sha", p_user_id: userId, p_limit: 20 },
  });

  const invalid = request({ query: { query: "s%" } });
  const invalidResponse = response();
  await userApi.handleFriendSearch(invalid.req, invalidResponse);
  assert.equal(invalidResponse.code, 400);
  assert.equal(invalid.calls.length, 0);
});

test("friend data is scoped to the authenticated user", async () => {
  const friendData = { friends: [], incomingRequests: [], outgoingRequests: [], shares: [] };
  const { req, calls } = request({ data: friendData });
  req.query.userId = friendId;
  const res = response();

  await userApi.handleFriendData(req, res);

  assert.deepEqual(res.body, friendData);
  assert.deepEqual(calls[0], {
    name: "get_friend_data",
    args: { p_user_id: userId },
  });
});

test("friend request endpoints use authenticated identity and reject invalid targets", async () => {
  const { req, calls } = request({ body: { friendId, userId: friendId }, data: "outgoing" });
  const res = response();

  await userApi.handleFriendRequest(req, res);

  assert.deepEqual(res.body, { status: "outgoing" });
  assert.deepEqual(calls[0], {
    name: "create_friend_request",
    args: { p_sender_id: userId, p_recipient_id: friendId },
  });

  const invalid = request({ body: { friendId: userId } });
  const invalidResponse = response();
  await userApi.handleFriendRequest(invalid.req, invalidResponse);
  assert.equal(invalidResponse.code, 400);
  assert.equal(invalid.calls.length, 0);
});

test("friend response, removal, and product share call their guarded database functions", async () => {
  const responseRequest = request({ body: { friendId, accept: true }, data: true });
  const responseResult = response();
  await userApi.handleFriendResponse(responseRequest.req, responseResult);
  assert.deepEqual(responseResult.body, { accepted: true });
  assert.deepEqual(responseRequest.calls[0], {
    name: "respond_friend_request",
    args: { p_user_id: userId, p_friend_id: friendId, p_accept: true },
  });

  const removalRequest = request({ params: { friendId }, data: true });
  const removalResult = response();
  await userApi.handleFriendRemoval(removalRequest.req, removalResult);
  assert.deepEqual(removalResult.body, { removed: true });
  assert.deepEqual(removalRequest.calls[0], {
    name: "remove_friendship",
    args: { p_user_id: userId, p_friend_id: friendId },
  });

  const shareRequest = request({
    body: { friendId, asin: "B012345678", senderId: friendId },
    data: "00000000-0000-4000-8000-000000000099",
  });
  const shareResult = response();
  await userApi.handleProductShare(shareRequest.req, shareResult);
  assert.equal(shareResult.code, 201);
  assert.deepEqual(shareResult.body, {
    shareId: "00000000-0000-4000-8000-000000000099",
  });
  assert.deepEqual(shareRequest.calls[0], {
    name: "share_product_with_friend",
    args: {
      p_sender_id: userId,
      p_recipient_id: friendId,
      p_asin: "B012345678",
    },
  });

  const invalidShare = request({ body: { friendId, asin: "not-an-asin" } });
  const invalidShareResult = response();
  await userApi.handleProductShare(invalidShare.req, invalidShareResult);
  assert.equal(invalidShareResult.code, 400);
  assert.equal(invalidShare.calls.length, 0);
});
