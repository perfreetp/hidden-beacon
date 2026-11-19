import * as pc from 'playcanvas'
import { TARGET_DEFS } from './targets'

// 搭建一个程序化「三重檐古建」场景，返回可拾取网格与观察目标实体
export function buildScene(app) {
  const pickables = []
  const targetEnts = new Map()

  const mat = (hex, emissive = 0) => {
    const m = new pc.StandardMaterial()
    const c = new pc.Color().fromString(hex)
    m.diffuse = c
    if (emissive > 0) {
      m.emissive = c.clone()
      m.emissiveTint = true
    }
    m.update()
    return m
  }

  const M = {
    stone: mat('#8d99ae'),
    stoneDark: mat('#6c757d'),
    wood: mat('#7f4f24'),
    pillar: mat('#9c6644'),
    wall: mat('#e0cfa9'),
    roof: mat('#3d5a80'),
    roofEdge: mat('#b23a48'),
    gold: mat('#ffd166', 1),
    ground: mat('#4a5d4e')
  }

  function addPrim(type, name, sx, sy, sz, x, y, z, material, pickable = true) {
    const e = new pc.Entity(name)
    e.addComponent('model', { type })
    e.setLocalScale(sx, sy, sz)
    e.setPosition(x, y, z)
    e.model.meshInstances.forEach(mi => { mi.material = material })
    app.root.addChild(e)
    if (pickable) pickables.push(...e.model.meshInstances)
    return e
  }

  // 地面
  addPrim('box', 'ground', 90, 0.1, 90, 0, -0.05, 0, M.ground)

  // 三重台基
  addPrim('box', 'taiji1', 20, 1.0, 20, 0, 0.5, 0, M.stoneDark)
  addPrim('box', 'taiji2', 16, 0.8, 16, 0, 1.4, 0, M.stone)
  addPrim('box', 'taiji3', 12, 0.6, 12, 0, 2.1, 0, M.stoneDark)
  // 正面台阶
  addPrim('box', 'steps', 4, 0.9, 2.4, 0, 0.45, 10.6, M.stone)

  // 柱廊（8 根）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    addPrim('cylinder', 'pillar' + i, 0.5, 3.2, 0.5, Math.cos(a) * 4.6, 4.0, Math.sin(a) * 4.6, M.pillar)
  }

  // 一层殿身 + 斗拱层 + 一重檐
  addPrim('box', 'hall1', 7, 3.2, 7, 0, 4.0, 0, M.wall)
  addPrim('box', 'dougong1', 9, 0.5, 9, 0, 5.85, 0, M.roofEdge)
  addPrim('cone', 'roof1', 14, 2.2, 14, 0, 7.2, 0, M.roof)

  // 二层殿身 + 斗拱 + 二重檐
  addPrim('box', 'hall2', 4.5, 2.0, 4.5, 0, 8.3, 0, M.wall)
  addPrim('box', 'dougong2', 6, 0.4, 6, 0, 9.5, 0, M.roofEdge)
  addPrim('cone', 'roof2', 10, 1.8, 10, 0, 10.6, 0, M.roof)

  // 塔刹
  addPrim('cylinder', 'finial', 0.3, 1.6, 0.3, 0, 12.2, 0, M.gold)
  addPrim('sphere', 'finial-top', 0.7, 0.7, 0.7, 0, 13.1, 0, M.gold)

  // 匾额（正殿正面 +Z）
  addPrim('box', 'bian-e', 2.0, 0.7, 0.12, 0, 4.9, 3.56, M.wood)

  // 石狮一对
  addPrim('box', 'lion-l', 0.9, 1.1, 1.3, 2.5, 2.95, 8, M.stone)
  addPrim('box', 'lion-r', 0.9, 1.1, 1.3, -2.5, 2.95, 8, M.stone)

  // 经幢
  addPrim('cylinder', 'jingchuang', 0.6, 2.5, 0.6, -6, 2.25, 6, M.stone)

  // 观察目标标记（不参与建筑拾取）
  for (const def of TARGET_DEFS) {
    const e = new pc.Entity('target-' + def.id)
    e.addComponent('model', { type: 'sphere' })
    e.setLocalScale(0.36, 0.36, 0.36)
    e.setPosition(def.pos[0], def.pos[1], def.pos[2])
    const m = new pc.StandardMaterial()
    const c = new pc.Color().fromString(def.color)
    m.diffuse = c
    m.emissive = c.clone()
    m.emissiveTint = true
    m.update()
    e.model.meshInstances.forEach(mi => { mi.material = m })
    app.root.addChild(e)
    targetEnts.set(def.id, e)
  }

  // 灯光
  const sun = new pc.Entity('sun')
  sun.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.96, 0.88),
    intensity: 1.1,
    castShadows: false
  })
  sun.setEulerAngles(50, 35, 0)
  app.root.addChild(sun)
  app.scene.ambientLight = new pc.Color(0.35, 0.38, 0.45)

  let time = 0
  function update(dt) {
    time += dt
    // 飞鸟目标绕塔盘旋（演示「跟随」模式）
    const bird = targetEnts.get('fei-niao')
    if (bird) {
      const a = time * 0.45
      bird.setPosition(Math.cos(a) * 9, 9 + Math.sin(time * 1.3) * 1.2, Math.sin(a) * 9)
    }
    // 目标标记呼吸脉动
    let i = 0
    for (const e of targetEnts.values()) {
      const s = 0.36 + Math.sin(time * 3 + i) * 0.05
      e.setLocalScale(s, s, s)
      i++
    }
  }

  return { pickables, targetEnts, update }
}
