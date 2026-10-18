"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getFriendData,
  removeFriend,
  respondToFriendRequest,
  searchFriendAccounts,
  sendFriendRequest,
} from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import ProductImage from "@/components/product-image/product-image";
import PageHeader from "@/components/page-header/page-header";
import styles from "./friends.module.css";

function errorText(error, fallback) {
  return error?.response?.data?.error || error?.message || fallback;
}

export default function Friends() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refreshData = useCallback(async () => {
    const nextData = await getFriendData();
    setData(nextData);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    getFriendData()
      .then(nextData => {
        if (!active) return;
        setData(nextData);
        setLoading(false);
      })
      .catch(loadError => {
        if (!active) return;
        setError(errorText(loadError, "Friends could not be loaded."));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const search = async (event) => {
    event.preventDefault();
    const prefix = query.trim();
    if (prefix.length < 2) {
      setError("Enter at least two characters to search usernames.");
      return;
    }
    setSearching(true);
    setError("");
    setNotice("");
    setResults([]);
    try {
      setResults(await searchFriendAccounts(prefix));
    } catch (searchError) {
      setError(errorText(searchError, "Account search is temporarily unavailable."));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const updateRelationship = async (key, operation, successMessage) => {
    setBusyId(key);
    setError("");
    setNotice("");
    try {
      await operation();
      await refreshData();
      if (query.trim().length >= 2) {
        setResults(await searchFriendAccounts(query.trim()));
      }
      setNotice(successMessage);
    } catch (actionError) {
      setError(errorText(actionError, "That friend action could not be completed."));
    } finally {
      setBusyId("");
    }
  };

  const submitRequest = (person) => updateRelationship(
    person.userId,
    () => sendFriendRequest(person.userId),
    `Friend request sent to @${person.username}.`,
  );

  const respond = (person, accept) => updateRelationship(
    person.userId,
    () => respondToFriendRequest(person.userId, accept),
    accept ? `You and @${person.username} are now friends.` : `Request from @${person.username} declined.`,
  );

  const remove = (person) => updateRelationship(
    person.userId,
    () => removeFriend(person.userId),
    `@${person.username} was removed from your friends.`,
  );

  return (
    <section className="shop-page">
      <PageHeader
        description="Find people by username, connect, and share products you think they’ll love."
        title="Friends"
      />
      {error && <p className={styles.noticeError} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <section className={`${styles.searchPanel} shop-panel`} aria-labelledby="find-friends-title">
        <h2 id="find-friends-title">Find friends</h2>
        <p>Search by the username they use on ShopScroll.</p>
        <form className={styles.searchForm} onSubmit={search}>
          <label className={styles.searchBox}>
            <Icon name="search" size={18} />
            <input
              autoComplete="off"
              maxLength={24}
              onChange={event => setQuery(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="Search usernames"
              value={query}
            />
          </label>
          <Button disabled={searching || query.trim().length < 2} type="submit">
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
        {results.length > 0 && (
          <ul className={styles.peopleList} aria-label="Username search results">
            {results.map(person => (
              <li key={person.userId}>
                <span className={styles.avatar}>{person.username.slice(0, 2).toUpperCase()}</span>
                <strong>@{person.username}</strong>
                {person.relationship === "friends" ? (
                  <span className={styles.status}>Friends</span>
                ) : person.relationship === "outgoing" ? (
                  <span className={styles.status}>Request sent</span>
                ) : person.relationship === "incoming" ? (
                  <Button
                    disabled={busyId === person.userId}
                    onClick={() => respond(person, true)}
                    variant="secondary"
                  >
                    Accept request
                  </Button>
                ) : (
                  <Button
                    disabled={busyId === person.userId}
                    onClick={() => submitRequest(person)}
                    variant="secondary"
                  >
                    <Icon name="plus" size={16} /> Add friend
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && !error && (
          <p className={styles.emptyInline}>No matching usernames found.</p>
        )}
      </section>

      {loading ? (
        <p className={styles.loading} role="status">Loading your friends…</p>
      ) : data && (
        <div className={styles.sections}>
          <section className={`${styles.listPanel} shop-panel`} aria-labelledby="requests-title">
            <h2 id="requests-title">Friend requests</h2>
            {data.incomingRequests.length ? (
              <ul className={styles.peopleList}>
                {data.incomingRequests.map(person => (
                  <li key={person.userId}>
                    <span className={styles.avatar}>{person.username.slice(0, 2).toUpperCase()}</span>
                    <strong>@{person.username}</strong>
                    <div className={styles.rowActions}>
                      <Button
                        disabled={busyId === person.userId}
                        onClick={() => respond(person, true)}
                        variant="primary"
                      >
                        Accept
                      </Button>
                      <Button
                        disabled={busyId === person.userId}
                        onClick={() => respond(person, false)}
                        variant="secondary"
                      >
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.emptyInline}>No pending requests.</p>}
            {data.outgoingRequests.length > 0 && (
              <>
                <h3>Sent</h3>
                <ul className={styles.peopleList}>
                  {data.outgoingRequests.map(person => (
                    <li key={person.userId}>
                      <span className={styles.avatar}>{person.username.slice(0, 2).toUpperCase()}</span>
                      <strong>@{person.username}</strong>
                      <span className={styles.status}>Request sent</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className={`${styles.listPanel} shop-panel`} aria-labelledby="your-friends-title">
            <h2 id="your-friends-title">Your friends</h2>
            {data.friends.length ? (
              <ul className={styles.peopleList}>
                {data.friends.map(person => (
                  <li key={person.userId}>
                    <span className={styles.avatar}>{person.username.slice(0, 2).toUpperCase()}</span>
                    <strong>@{person.username}</strong>
                    <Button
                      disabled={busyId === person.userId}
                      onClick={() => remove(person)}
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : <p className={styles.emptyInline}>Search for a username to add your first friend.</p>}
          </section>

          <section className={`${styles.sharesPanel} shop-panel`} aria-labelledby="shared-with-you-title">
            <h2 id="shared-with-you-title">Shared with you</h2>
            {data.shares.length ? (
              <div className={styles.shares}>
                {data.shares.map(share => (
                  <article className={styles.shareCard} key={share.id}>
                    <ProductImage alt="" src={share.imageUrl} />
                    <div>
                      <small>@{share.senderUsername} shared</small>
                      <h3>{share.title}</h3>
                      {share.brand && <p>{share.brand}</p>}
                      {Number.isInteger(share.priceCents) && (
                        <strong>${(share.priceCents / 100).toFixed(2)}</strong>
                      )}
                    </div>
                    {share.productUrl && (
                      <a href={share.productUrl} rel="noreferrer" target="_blank">
                        View <Icon name="arrowRight" size={15} />
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : <p className={styles.emptyInline}>Products your friends share with you will appear here.</p>}
          </section>
        </div>
      )}
    </section>
  );
}
