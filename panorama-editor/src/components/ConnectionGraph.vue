<template>
  <div class="panel">
    <div class="panel-title">点位连接关系 <em class="muted">{{ state.pointOrder.length }} 点 / {{ links.length }} 连接</em></div>
    <svg ref="svgRef" viewBox="0 0 320 200" class="graph-svg"></svg>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import * as d3 from 'd3'
import { state, links, switchPoint } from '../store/editor.js'

const svgRef = ref(null)
let simulation

function render() {
  const svg = d3.select(svgRef.value)
  svg.selectAll('*').remove()
  const W = 320, H = 200
  const nodes = state.pointOrder.map(id => ({ id, name: state.points[id].name }))
  const seen = new Set()
  const ls = []
  for (const l of links.value) {
    const key = [l.from, l.to].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    ls.push({ source: l.from, target: l.to })
  }
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(ls).id(d => d.id).distance(70))
    .force('charge', d3.forceManyBody().strength(-160))
    .force('center', d3.forceCenter(W / 2, H / 2))
    .force('collide', d3.forceCollide(22))

  const link = svg.append('g').selectAll('line').data(ls).join('line')
    .attr('stroke', '#4c6fa8').attr('stroke-width', 2)
    .attr('marker-end', 'url(#graphArrow)')
  svg.append('defs').append('marker').attr('id', 'graphArrow')
    .attr('markerWidth', 8).attr('markerHeight', 8).attr('refX', 7).attr('refY', 4).attr('orient', 'auto')
    .append('path').attr('d', 'M0,0 L8,4 L0,8 Z').attr('fill', '#4c6fa8')

  const g = svg.append('g').selectAll('g').data(nodes).join('g').style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y })
      .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null }))
    .on('click', (e, d) => switchPoint(d.id))
  g.append('circle').attr('r', 13).attr('fill', '#2f81f7').attr('stroke', '#b9d6ff').attr('stroke-width', 1.5)
  g.append('text').attr('text-anchor', 'middle').attr('dy', 26).attr('fill', '#c9d4e0')
    .style('font-size', '10px').text(d => d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name)

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
    g.attr('transform', d => `translate(${d.x},${d.y})`)
  })
}

onMounted(render)
watch(() => [state.pointOrder, links.value.length], render)
</script>

<style scoped>
.panel { background: #131c2b; border: 1px solid #223044; border-radius: 10px; padding: 12px; }
.panel-title { font-size: 13px; font-weight: 700; color: #e6edf3; display: flex; justify-content: space-between; }
.muted { color: #7f93ab; font-weight: 400; font-size: 11px; }
.graph-svg { width: 100%; height: 200px; }
</style>
