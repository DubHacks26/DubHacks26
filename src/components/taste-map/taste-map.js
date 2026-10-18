"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getHashtagAlignment, getHashtagGraph } from "@/api/UserAPI";
import Button from "@/components/button/button";
import Icon from "@/components/icon/icon";
import styles from "./taste-map.module.css";

const MIN_EDGE_SIMILARITY = 0.55;
const LABELS_ZOOM_RATIO = 0.0;
const ALIGNMENT_SIZE_LOW_SIMILARITY = 0.15;
const ALIGNMENT_SIZE_HIGH_SIMILARITY = 0.65;
const ALIGNMENT_COLOR_THRESHOLD = 0.4;
const ALIGNMENT_MAX_RADIUS = 3;
const ALIGNMENT_BASE_NODE_VALUE = 0.9;
const ALIGNMENT_LOW_COLOR = "#a2a3a8";
const ALIGNMENT_HIGH_COLOR = "#6d3a63";

function displayName(name) {
  return String(name || "Untitled")
    .replaceAll("_", " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function alignmentStrength(similarity) {
  const value = Number(similarity);
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0,
    (value - ALIGNMENT_SIZE_LOW_SIMILARITY)
    / (ALIGNMENT_SIZE_HIGH_SIMILARITY - ALIGNMENT_SIZE_LOW_SIMILARITY)));
}

function alignmentColor(similarity) {
  const value = Number(similarity);
  return Number.isFinite(value) && value >= ALIGNMENT_COLOR_THRESHOLD
    ? ALIGNMENT_HIGH_COLOR
    : ALIGNMENT_LOW_COLOR;
}

function alignmentNodeValue(similarity) {
  const radiusScale = 1 + (ALIGNMENT_MAX_RADIUS - 1) * alignmentStrength(similarity);
  // 3d-force-graph's nodeVal controls sphere volume, so cube the radius scale.
  return ALIGNMENT_BASE_NODE_VALUE * radiusScale ** 3;
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
  const [alignmentMode, setAlignmentMode] = useState(false);
  const [alignmentScores, setAlignmentScores] = useState(null);
  const [alignmentHasInterests, setAlignmentHasInterests] = useState(null);
  const [alignmentLoading, setAlignmentLoading] = useState(false);
  const [alignmentError, setAlignmentError] = useState("");
  const [hoverTarget, setHoverTarget] = useState(null);

  const refresh = useCallback(() => {
    setAlignmentMode(false);
    setAlignmentScores(null);
    setAlignmentHasInterests(null);
    setAlignmentError("");
    setHoverTarget(null);
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

  const toggleAlignment = useCallback(async () => {
    if (alignmentMode) {
      setAlignmentMode(false);
      return;
    }
    if (alignmentScores) {
      setAlignmentMode(true);
      return;
    }

    setAlignmentLoading(true);
    setAlignmentError("");
    try {
      const result = await getHashtagAlignment(graph.nodes.map(node => node.id));
      const scores = Object.entries(result.scores || {}).map(([id, value]) => [
        id,
        value !== null && Number.isFinite(Number(value)) ? Number(value) : null,
      ]);
      setAlignmentScores(new Map(scores));
      setAlignmentHasInterests(result.hasInterests === true);
      setAlignmentMode(true);
    } catch (requestError) {
      setAlignmentError(requestError.response?.data?.error || requestError.message || "Taste alignment could not load.");
    } finally {
      setAlignmentLoading(false);
    }
  }, [alignmentMode, alignmentScores, graph.nodes]);

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
        .onBackgroundClick(() => {
          setSelectedId(null);
          setHoverTarget(null);
        })
        .onNodeHover(node => {
          const id = node?.id || null;
          setHoverTarget(current => {
            if (!id) return current?.type === "node" ? null : current;
            return current?.type === "node" && current.id === id ? current : { type: "node", id };
          });
        })
        .onLinkHover(link => {
          const id = link ? linkId(link) : null;
          setHoverTarget(current => {
            if (!id) return current?.type === "link" ? null : current;
            return current?.type === "link" && current.id === id ? current : { type: "link", id };
          });
        });

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
          if (cameraPosition.distanceTo({ x: node.x, y: node.y, z: node.z }) > fitDistance * 0.58) continue;
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
  const hoverHighlight = useMemo(() => {
    const nodes = new Set();
    const links = new Set();
    if (!hoverTarget) return { nodes, links };

    if (hoverTarget.type === "node") {
      nodes.add(hoverTarget.id);
      for (const link of graph.links) {
        if (link.source !== hoverTarget.id && link.target !== hoverTarget.id) continue;
        nodes.add(link.source === hoverTarget.id ? link.target : link.source);
        links.add(linkId(link));
      }
    } else {
      const link = graph.links.find(candidate => linkId(candidate) === hoverTarget.id);
      if (link) {
        nodes.add(link.source);
        nodes.add(link.target);
        links.add(hoverTarget.id);
      }
    }
    return { nodes, links };
  }, [graph.links, hoverTarget]);

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
        if (hoverTarget && hoverHighlight.nodes.has(node.id)) {
          return hoverTarget.type === "node" && node.id === hoverTarget.id ? "#e36f5e" : "#c27d3e";
        }
        if (hoverTarget) return alignmentMode ? alignmentColor(alignmentScores?.get(node.id)) : "#d7bfd3";
        if (alignmentMode) {
          return node.id === selectedId ? "#e36f5e" : alignmentColor(alignmentScores?.get(node.id));
        }
        if (!selectedId || node.id === selectedId || selectedNeighbors.has(node.id)) return node.id === selectedId ? "#e36f5e" : "#8d4f86";
        return "#d7bfd3";
      })
      .nodeVal(node => {
        if (alignmentMode) return alignmentNodeValue(alignmentScores?.get(node.id));
        if (hoverTarget && hoverHighlight.nodes.has(node.id)) {
          const isHoveredNode = hoverTarget.type === "node" && node.id === hoverTarget.id;
          return isHoveredNode ? 3 : 1.5;
        }
        return node.id === selectedId ? 2.4 : selectedNeighbors.has(node.id) ? 1.35 : 0.9;
      })
      .linkColor(link => {
        if (hoverHighlight.links.has(linkId(link))) return "#e36f5e";
        if (hoverTarget) return "#e9dfe7";
        if (!selectedId || selectedLinks.has(linkId(link))) return "#a66a9f";
        return "#eadde7";
      })
      .linkWidth(link => hoverHighlight.links.has(linkId(link))
        ? 4
        : 0.7 + Math.max(0, Number(link.similarity) || 0) * 1.8)
      .linkDirectionalParticles(link => hoverHighlight.links.has(linkId(link)) ? 4 : 0)
      .linkDirectionalParticleWidth(3)
      .linkDirectionalParticleColor(() => "#e36f5e")
      .linkOpacity(hoverTarget ? 0.55 : selectedId ? 0.62 : 0.42)
      .refresh();
  }, [alignmentMode, alignmentScores, hoverHighlight, hoverTarget, rendererReady, selectedId, selectedLinks, selectedNeighbors]);

  return (
    <section className={styles.page} aria-labelledby="taste-map-title">
      <header className={styles.header}>
        <div>
          <Link className={styles.back} href="/discover"><Icon name="arrowLeft" size={16} /> Back to Discover</Link>
          <h1 id="taste-map-title">The ideas shaping your next find.</h1>
          <p>Related hashtags gather into neighborhoods. Rotate, pan, and zoom to explore the spaces between your product interests.</p>
        </div>
      </header>

      <div className={styles.stats} aria-label="Taste map summary">
        <Button
          aria-pressed={alignmentMode}
          disabled={status !== "ready" || !graph.nodes.length || alignmentLoading}
          onClick={toggleAlignment}
          variant={alignmentMode ? "primary" : "secondary"}
        >
          <Icon name="sparkles" size={16} />
          {alignmentLoading ? "Measuring alignment…" : alignmentMode ? "Hide alignment" : "Show my alignment"}
        </Button>
        <Button disabled={status === "loading" || alignmentLoading} onClick={refresh} variant="secondary">
          <Icon name="rotate" size={16} /> Refresh map
        </Button>
      </div>

      {alignmentError && <p className={styles.alignmentError} role="alert">{alignmentError}</p>}
      {alignmentMode && <div className={styles.alignmentLegend} aria-live="polite">
        <span><i className={styles.lowAlignmentDot} /> Below {ALIGNMENT_COLOR_THRESHOLD.toFixed(2)}</span>
        <span><i className={styles.highAlignmentDot} /> At least {ALIGNMENT_COLOR_THRESHOLD.toFixed(2)}</span>
        <span>Color marks the threshold; size scales with cosine match.</span>
        {alignmentHasInterests === false && <span className={styles.alignmentHint}>Your taste profile is empty. Like or save products to start building it.</span>}
      </div>}

      {selected && <div className={styles.selectedSummary} aria-live="polite">
        <div>
          <span className="shop-kicker">Selected idea</span>
          <strong>{displayName(selected.name)}</strong>
          <span>{selectedNeighbors.size - 1} connected ideas</span>
          {alignmentMode && <span>Cosine similarity: {Number.isFinite(alignmentScores?.get(selected.id))
            ? alignmentScores.get(selected.id).toFixed(2)
            : "Unavailable"}</span>}
        </div>
        <Button onClick={() => setSelectedId(null)} variant="secondary">Clear selection</Button>
      </div>}

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
          {status === "ready" && !rendererError && Boolean(graph.nodes.length) && <p className={styles.hint}><Icon name="rotate" size={15} /> Left drag rotates · right drag pans · scroll zooms</p>}
        </div>
      </div>
    </section>
  );
}
