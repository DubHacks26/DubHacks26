"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHashtagGraph } from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./taste-map.module.css";

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

function endpointId(endpoint) {
  return typeof endpoint === "object" ? endpoint.id : endpoint;
}

function linkId(link) {
  return `${endpointId(link.source)}:${endpointId(link.target)}`;
}

function graphDataForRenderer(graph) {
  return {
    nodes: graph.nodes.map(node => ({ ...node })),
    links: graph.links.map(link => ({ ...link })),
  };
}

export default function TasteMap() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const graphRef = useRef({ nodes: [], links: [] });
  const [rendererReady, setRendererReady] = useState(false);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

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
    Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  useEffect(() => {
    let active = true;
    let resizeObserver;
    let forceGraph;
    const host = containerRef.current;
    if (!host) return undefined;

    import("3d-force-graph").then(({ default: ForceGraph3D }) => {
      if (!active) return;
      forceGraph = ForceGraph3D(host, {
        controlType: "orbit",
        rendererConfig: { antialias: true, alpha: true },
      })
        .backgroundColor("#fcfbf9")
        .showNavInfo(false)
        .enableNodeDrag(false)
        .nodeRelSize(5)
        .nodeResolution(10)
        .linkOpacity(0.45)
        .linkWidth(link => 0.7 + Math.max(0, Number(link.similarity) || 0) * 1.8)
        .nodeLabel(node => `<strong>${displayName(node.name)}</strong><br />Related product idea`)
        .onNodeClick(node => setSelectedId(current => current === node.id ? null : node.id))
        .onBackgroundClick(() => setSelectedId(null));

      const controls = forceGraph.controls();
      controls.enablePan = true;
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.panSpeed = 0.85;

      const resize = () => forceGraph.width(host.clientWidth).height(host.clientHeight);
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(host);
      rendererRef.current = forceGraph;
      // The graph request can finish before the renderer's client-only module.
      // Apply the latest result here as well as in the update effect below.
      forceGraph.graphData(graphDataForRenderer(graphRef.current));
      setRendererReady(true);
    }).catch(() => {
      if (!active) return;
      setError("The 3D map renderer could not load in this browser.");
      setStatus("error");
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      rendererRef.current = null;
      forceGraph?._destructor();
    };
  }, []);

  const selected = graph.nodes.find(node => node.id === selectedId) || null;
  const selectedLinks = useMemo(() => new Set(graph.links
    .filter(link => link.source === selectedId || link.target === selectedId)
    .map(linkId)), [graph.links, selectedId]);
  const selectedNeighbors = useMemo(() => new Set(graph.links
    .filter(link => link.source === selectedId || link.target === selectedId)
    .flatMap(link => [link.source, link.target])), [graph.links, selectedId]);

  useEffect(() => {
    const forceGraph = rendererRef.current;
    if (!forceGraph || !rendererReady) return;
    forceGraph.graphData(graphDataForRenderer(graph));
    if (graph.nodes.length) {
      window.requestAnimationFrame(() => forceGraph.zoomToFit(600, 85));
    }
  }, [graph, rendererReady]);

  useEffect(() => {
    const forceGraph = rendererRef.current;
    if (!forceGraph || !rendererReady) return;
    forceGraph
      .nodeColor(node => {
        if (!selectedId || node.id === selectedId || selectedNeighbors.has(node.id)) return node.id === selectedId ? "#e36f5e" : "#8d4f86";
        return "#d7bfd3";
      })
      .nodeVal(node => node.id === selectedId ? 2.4 : selectedNeighbors.has(node.id) ? 1.35 : 0.9)
      .linkColor(link => {
        if (!selectedId || selectedLinks.has(linkId(link))) return "#a66a9f";
        return "#eadde7";
      })
      .linkOpacity(selectedId ? 0.62 : 0.42)
      .refresh();
  }, [rendererReady, selectedId, selectedLinks, selectedNeighbors]);

  return (
    <section className={styles.page} aria-labelledby="taste-map-title">
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/discover"><Icon name="arrowLeft" size={16} /> Back to Discover</Link>
          <p className="shop-kicker">Your taste map</p>
          <h1 id="taste-map-title">The ideas shaping your next find.</h1>
          <p>Related hashtags gather into neighborhoods. Rotate, pan, and zoom to explore the spaces between your product interests.</p>
        </div>
        <Button disabled={status === "loading"} onClick={refresh} variant="secondary">
          <Icon name="rotate" size={16} /> Refresh map
        </Button>
      </header>

      <div className={styles.stats} aria-label="Taste map summary">
        <span><b>{graph.nodes.length}</b> ideas</span>
        <span><b>{graph.links.length}</b> relationships</span>
        <span><Icon name="sparkles" size={15} /> semantic connections</span>
      </div>

      <div className={styles.layout}>
        <div className={styles.mapPanel}>
          <div className={styles.graphHost} ref={containerRef} />
          {status === "loading" && <div className={styles.message} role="status"><span className={styles.spinner} /> Mapping your tastes…</div>}
          {status === "error" && <div className={styles.message} role="alert"><Icon name="search" size={27} /><strong>Map unavailable</strong><span>{error}</span><Button onClick={refresh}>Try again</Button></div>}
          {status === "ready" && !graph.nodes.length && <div className={styles.message}><Icon name="sparkles" size={28} /><strong>Your map is ready for its first connections.</strong><span>Browse a few products, then refresh this view once hashtags have been synced.</span></div>}
          {status === "ready" && Boolean(graph.nodes.length) && <p className={styles.hint}><Icon name="rotate" size={15} /> Left drag rotates · right drag pans · scroll zooms</p>}
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
            <p className={styles.detailNote}>The 3D graph supports orbiting, panning, and zooming so dense neighborhoods remain explorable.</p>
          </>}
        </aside>
      </div>
    </section>
  );
}
