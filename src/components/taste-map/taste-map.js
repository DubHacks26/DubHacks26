"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHashtagGraph } from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./taste-map.module.css";

const MIN_EDGE_SIMILARITY = 0.55;
const LABELS_ZOOM_RATIO = 0.45;

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
    ? graph.links.filter(link => ids.has(link?.source)
      && ids.has(link?.target)
      && Number(link?.similarity) >= MIN_EDGE_SIMILARITY)
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

function GraphLabel({ node, labelElementsRef, labelUpdateRef }) {
  const registerElement = useCallback(element => {
    if (element) labelElementsRef.current.set(node.id, element);
    else labelElementsRef.current.delete(node.id);
    labelUpdateRef.current?.();
  }, [labelElementsRef, labelUpdateRef, node.id]);

  return <span className={styles.nodeLabel} ref={registerElement}>{displayName(node.name)}</span>;
}

export default function TasteMap() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const graphRef = useRef({ nodes: [], links: [] });
  const labelElementsRef = useRef(new Map());
  const labelUpdateRef = useRef(null);
  const fitDistanceRef = useRef(0);
  const [rendererReady, setRendererReady] = useState(false);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [rendererError, setRendererError] = useState("");
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
    let controls;
    let scheduleLabelUpdate;
    let labelFrame = 0;
    const host = containerRef.current;
    if (!host) return undefined;

    import("3d-force-graph").then(({ default: ForceGraph3D }) => {
      if (!active) return;
      forceGraph = new ForceGraph3D(host, {
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

      controls = forceGraph.controls();
      controls.enablePan = true;
      controls.enableDamping = true;
      controls.dampingFactor = 0.12;
      controls.panSpeed = 0.85;

      const updateLabels = () => {
        labelFrame = 0;
        const fitDistance = fitDistanceRef.current;
        const zoomDistance = forceGraph.camera().position.distanceTo(controls.target);
        const labelElements = labelElementsRef.current;
        const nodes = forceGraph.graphData().nodes;
        if (!fitDistance || zoomDistance > fitDistance * LABELS_ZOOM_RATIO) {
          labelElements.forEach(element => { element.style.visibility = "hidden"; });
          return;
        }

        const cameraPosition = forceGraph.camera().position;
        const width = host.clientWidth;
        const height = host.clientHeight;
        const nearbyNodes = [...nodes]
          .filter(node => labelElements.has(node.id)
            && Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z))
          .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));

        labelElements.forEach(element => { element.style.visibility = "hidden"; });
        for (const node of nearbyNodes) {
          if (cameraPosition.distanceTo({ x: node.x, y: node.y, z: node.z }) > fitDistance * 0.72) continue;
          const point = forceGraph.graph2ScreenCoords(node.x, node.y, node.z);
          if (point.x < 8 || point.x > width - 8 || point.y < 8 || point.y > height - 8) continue;

          const element = labelElements.get(node.id);
          element.style.left = `${point.x}px`;
          element.style.top = `${point.y}px`;
          element.style.visibility = "visible";
        }
      };

      scheduleLabelUpdate = () => {
        if (labelFrame) return;
        labelFrame = window.requestAnimationFrame(updateLabels);
      };
      labelUpdateRef.current = scheduleLabelUpdate;
      controls.addEventListener("change", scheduleLabelUpdate);
      forceGraph.onEngineTick(scheduleLabelUpdate);

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
      setRendererError("The 3D map renderer could not load in this browser.");
    });

    return () => {
      active = false;
      resizeObserver?.disconnect();
      controls?.removeEventListener("change", scheduleLabelUpdate);
      if (labelFrame) window.cancelAnimationFrame(labelFrame);
      labelUpdateRef.current = null;
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
    let fitFrame = 0;
    let fitTimer = 0;
    forceGraph.graphData(graphDataForRenderer(graph));
    if (graph.nodes.length) {
      fitDistanceRef.current = 0;
      fitFrame = window.requestAnimationFrame(() => {
        forceGraph.zoomToFit(600, 85);
        fitTimer = window.setTimeout(() => {
          fitDistanceRef.current = forceGraph.camera().position.distanceTo(forceGraph.controls().target);
          labelUpdateRef.current?.();
        }, 700);
      });
    }
    return () => {
      if (fitFrame) window.cancelAnimationFrame(fitFrame);
      if (fitTimer) window.clearTimeout(fitTimer);
    };
  }, [graph, rendererReady]);

  useEffect(() => {
    if (!rendererReady) return undefined;
    const frame = window.requestAnimationFrame(() => labelUpdateRef.current?.());
    return () => window.cancelAnimationFrame(frame);
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
          <div className={styles.graphStage}>
            <div className={styles.graphHost} ref={containerRef} />
            <div className={styles.labelLayer} aria-hidden="true">
              {graph.nodes.map(node => <GraphLabel
                key={node.id}
                labelElementsRef={labelElementsRef}
                labelUpdateRef={labelUpdateRef}
                node={node}
              />)}
            </div>
          </div>
          {status === "loading" && !rendererError && <div className={styles.message} role="status"><span className={styles.spinner} /> Mapping your tastes…</div>}
          {(status === "error" || rendererError) && <div className={styles.message} role="alert"><Icon name="search" size={27} /><strong>Map unavailable</strong><span>{rendererError || error}</span><Button onClick={rendererError ? () => window.location.reload() : refresh}>Try again</Button></div>}
          {status === "ready" && !rendererError && !graph.nodes.length && <div className={styles.message}><Icon name="sparkles" size={28} /><strong>Your map is ready for its first connections.</strong><span>Browse a few products, then refresh this view once hashtags have been synced.</span></div>}
          {status === "ready" && !rendererError && Boolean(graph.nodes.length) && <p className={styles.hint}><Icon name="rotate" size={15} /> Left drag rotates · right drag pans · zoom in to reveal labels</p>}
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
