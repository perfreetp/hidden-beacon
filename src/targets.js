// 场景观察目标定义（与 3D 场景共享，id 保持稳定以便 roam.json 导入导出）
export const TARGET_DEFS = [
  { id: 'ta-sha',    name: '塔刹',       color: '#ffd166', pos: [0, 12.6, 0] },
  { id: 'dou-gong',  name: '斗拱层',     color: '#ef476f', pos: [0, 6.1, 4.8] },
  { id: 'bian-e',    name: '正殿匾额',   color: '#06d6a0', pos: [0, 4.9, 3.7] },
  { id: 'shi-zi',    name: '石狮',       color: '#118ab2', pos: [2.5, 3.4, 8] },
  { id: 'jing-chuang', name: '经幢',     color: '#9b5de5', pos: [-6, 3.6, 6] },
  { id: 'fei-niao',  name: '飞鸟(移动)', color: '#f15bb5', pos: [9, 9, 0], moving: true }
]
