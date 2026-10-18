"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHashtagGraph } from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./taste-map.module.css";

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 620;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0) / 0x1_0000_0000;
}

function basePoint(id, index, total) {
  const vertical = 1 - ((index + 0.5) / Math.max(total, 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - vertical ** 2));
  const angle = index * GOLDEN_ANGLE + hash(id) * 0.55;
  return { x: Math.cos(angle) * radius, y: vertical, z: Math.sin(angle) * radius };
}

function project(point, yaw, pitch) {
  const yawRadians = yaw * Math.PI / 180;
  const pitchRadians = pitch * Math.PI / 180;
  const x = point.x * Math.cos(yawRadians) - point.z * Math.sin(yawRadians);
  const z = point.x * Math.sin(yawRadians) + point.z * Math.cos(yawRadians);
  const y = point.y * Math.cos(pitchRadians) - z * Math.sin(pitchRadians);
  const depth = point.y * Math.sin(pitchRadians) + z * Math.cos(pitchRadians);
  const scale = 0.78 + (depth + 1) * 0.15;
  return {
    x: VIEW_WIDTH / 2 + x * 350 * scale,
    y: VIEW_HEIGHT / 2 + y * 245 * scale,
    depth,
    scale,
  };
}

function displayName(name) {
  return String(name || "Untitled")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function normalizeGraph(graph) {
  const nodes = Array.isArray(graph?.nodes)
    ? graph.nodes.filter(node => typeof node?.id === "string" && typeof node?.name === "string")
    : [];
  const ids = new Set(nodes.map(node => node.id));
  const links = Array.isArray(graph?.links)
    ? graph.links.filter(link => ids.has(link?.source) && ids.has(link?.target))
    : [];
  return { nodes, links };
}

export default function TasteMap() {
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [rotation, setRotation] = useState({ yaw: -18, pitch: -10 });
  const [selectedId, setSelectedId] = useState(null);
  const drag = useRef(null);

  const refresh = useCallback(() => {
    setStatus("loading");
    setError("");
    getHashtagGraph()
      .then((nextGraph) => {
        setGraph(normalizeGraph(nextGraph));
        setStatus("ready");
      })
      .catch((requestError) => {
        setError(requestError.response?.data?.error || requestError.message || "The taste map could not load.");
        setStatus("error");
      });
  }, []);

  useEffect(() => {
    // Defer the initial request so the loading-state update is not part of
    // the effect's synchronous render cycle.
    Promise.resolve().then(refresh);
  }, [refresh]);

  const nodes = useMemo(() => [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id)), [graph.nodes]);
  const positions = useMemo(() => nodes
    .map((node, index) => ({ node, ...project(basePoint(node.id, index, nodes.length), rotation.yaw, rotation.pitch) }))
    .sort((a, b) => a.depth - b.depth), [nodes, rotation]);
  const positionById = useMemo(() => new Map(positions.map(point => [point.node.id, point])), [positions]);
  const selected = nodes.find(node => node.id === selectedId) || null;
  const selectedLinks = useMemo(() => new Set(graph.links
    .filter(link => link.source === selectedId || link.target === selectedId)
    .map(link => `${link.source}:${link.target}`)), [graph.links, selectedId]);
  const selectedNeighbors = useMemo(() => new Set(graph.links
    .filter(link => link.source === selectedId || link.target === selectedId)
    .flatMap(link => [link.source, link.target])), [graph.links, selectedId]);

  const startDrag = (event) => {
    drag.current = { x: event.clientX, y: event.clientY, ...rotation };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event) => {
    if (!drag.current) return;
    const nextYaw = drag.current.yaw + (event.clientX - drag.current.x) * 0.35;
    const nextPitch = Math.max(-60, Math.min(60, drag.current.pitch - (event.clientY - drag.current.y) * 0.25));
    setRotation({ yaw: nextYaw, pitch: nextPitch });
  };

  const endDrag = () => {
    drag.current = null;
  };

  const selectNode = (id) => {
    if (!drag.current) setSelectedId(current => current === id ? null : id);
  };

  return (
    <section className={styles.page} aria-labelledby="taste-map-title">
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/discover"><Icon name="arrowLeft" size={16} /> Back to Discover</Link>
          <p className="shop-kicker">Your taste map</p>
          <h1 id="taste-map-title">The ideas shaping your next find.</h1>
          <p>Related hashtags gather into neighborhoods. Drag to turn the map, then select a point to inspect its connections.</p>
        </div>
        <Button disabled={status === "loading"} onClick={refresh} variant="secondary">
          <Icon name="rotate" size={16} /> Refresh map
        </Button>
      </header>

      <div className={styles.stats} aria-label="Taste map summary">
        <span><b>{nodes.length}</b> ideas</span>
        <span><b>{graph.links.length}</b> relationships</span>
        <span><Icon name="sparkles" size={15} /> semantic connections</span>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapPanel}>
          {status === "loading" && <div className={styles.message} role="status"><span className={styles.spinner} /> Mapping your tastes…</div>}
          {status === "error" && <div className={styles.message} role="alert"><Icon name="search" size={27} /><strong>Map unavailable</strong><span>{error}</span><Button onClick={refresh}>Try again</Button></div>}
          {status === "ready" && !nodes.length && <div className={styles.message}><Icon name="sparkles" size={28} /><strong>Your map is ready for its first connections.</strong><span>Browse a few products, then refresh this view once hashtags have been synced.</span></div>}
          {status === "ready" && Boolean(nodes.length) && (
            <svg
              aria-label="Interactive three-dimensional hashtag map"
              className={styles.map}
              onPointerCancel={endDrag}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              role="img"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            >
              <defs>
                <radialGradient id="taste-map-glow"><stop stopColor="#e9deeb" stopOpacity="0.95" /><stop offset="1" stopColor="#f8f6f2" stopOpacity="0" /></radialGradient>
              </defs>
              <ellipse className={styles.glow} cx="500" cy="310" rx="410" ry="280" />
              {graph.links.map((link) => {
                const source = positionById.get(link.source);
                const target = positionById.get(link.target);
                if (!source || !target) return null;
                const key = `${link.source}:${link.target}`;
                const connected = selectedLinks.has(key);
                return <line
                  className={`${styles.link} ${selectedId ? (connected ? styles.linkSelected : styles.linkMuted) : ""}`}
                  key={key}
                  opacity={Math.max(0.12, Math.min(0.72, Number(link.similarity) || 0.25))}
                  x1={source.x}
                  x2={target.x}
                  y1={source.y}
                  y2={target.y}
                />;
              })}
              {positions.map(({ node, x, y, depth, scale }) => {
                const active = node.id === selectedId;
                const neighbor = selectedNeighbors.has(node.id);
                const label = active || (depth > 0.48 && scale > 0.98);
                return <g
                  aria-label={displayName(node.name)}
                  className={`${styles.node} ${active ? styles.nodeSelected : ""} ${selectedId && !active && !neighbor ? styles.nodeMuted : ""}`}
                  key={node.id}
                  onClick={() => selectNode(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectNode(node.id);
                    }
                  }}
                  role="button"
                  tabIndex="0"
                  transform={`translate(${x} ${y})`}
                >
                  <circle r={active ? 11 : 5 + (depth + 1) * 2.6} />
                  {label && <text x="14" y="5">{displayName(node.name)}</text>}
                </g>;
              })}
            </svg>
          )}
          {status === "ready" && Boolean(nodes.length) && <p className={styles.hint}><Icon name="rotate" size={15} /> Drag to rotate · select a point to trace its links</p>}
        </div>

        <aside className={styles.details} aria-live="polite">
          {selected ? <>
            <p className="shop-kicker">Selected idea</p>
            <h2>{displayName(selected.name)}</h2>
            <p>Connected to <strong>{selectedNeighbors.size - 1}</strong> ideas in this part of your map.</p>
            <div className={styles.detailRule} />
            <p className={styles.detailNote}>Connections represent semantic similarity between product hashtags, not products you have purchased.</p>
            <Button onClick={() => setSelectedId(null)} variant="secondary">Clear selection</Button>
          </> : <>
            <Icon className={styles.detailIcon} name="sparkles" size={25} />
            <p className="shop-kicker">Explore</p>
            <h2>Turn your taste into a constellation.</h2>
            <p>Select any idea to highlight its closest semantic neighbors.</p>
            <div className={styles.detailRule} />
            <p className={styles.detailNote}>Closer and brighter links indicate stronger similarity.</p>
          </>}
        </aside>
      </div>
    </section>
  );
}
