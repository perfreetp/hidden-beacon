// 设备型号库：类型 meta + 可选型号（米制尺寸）
export const TYPES = {
  desulf: { name: '脱硫塔', short: '脱硫', color: '#0ea5e9' },
  baghouse: { name: '布袋除尘器', short: '布袋', color: '#f59e0b' },
  stack: { name: '烟囱监测平台', short: '烟囱', color: '#64748b' },
  probe: { name: '采样探头', short: '探头', color: '#ef4444' },
  rack: { name: '管廊', short: '管廊', color: '#14b8a6' },
  ladder: { name: '爬梯', short: '爬梯', color: '#8b5cf6' }
};

export const TYPE_LIST = Object.entries(TYPES).map(([key, v]) => ({ key, ...v }));

export const MODELS = {
  desulf: [
    { model: 'TL-600', label: 'TL-600 喷淋脱硫塔', w: 4.2, h: 9.5 },
    { model: 'TL-900', label: 'TL-900 喷淋脱硫塔', w: 5.0, h: 11.0 },
    { model: 'TL-1200', label: 'TL-1200 双塔脱硫', w: 6.2, h: 13.0 }
  ],
  baghouse: [
    { model: 'BD-3200', label: 'BD-3200 布袋除尘器', w: 5.0, h: 6.5 },
    { model: 'BD-5000', label: 'BD-5000 布袋除尘器', w: 6.4, h: 7.5 },
    { model: 'BD-8000', label: 'BD-8000 长袋除尘器', w: 8.0, h: 8.5 }
  ],
  stack: [
    { model: 'YC-60', label: 'YC-60 监测烟囱', w: 2.2, h: 16.0 },
    { model: 'YC-80', label: 'YC-80 监测烟囱', w: 2.8, h: 20.0 },
    { model: 'YC-100', label: 'YC-100 监测烟囱', w: 3.4, h: 24.0 }
  ],
  probe: [
    { model: 'CY-I', label: 'CY-I 直插式采样探头', w: 0.7, h: 1.1 },
    { model: 'CY-II', label: 'CY-II 加热采样探头', w: 0.9, h: 1.3 },
    { model: 'CY-III', label: 'CY-III 稀释采样探头', w: 1.1, h: 1.5 }
  ],
  rack: [
    { model: 'GL-2L', label: 'GL-2L 双层管廊', w: 0, h: 2.6 },
    { model: 'GL-3L', label: 'GL-3L 三层管廊', w: 0, h: 3.4 }
  ],
  ladder: [
    { model: 'PT-600', label: 'PT-600 直爬梯', w: 0.8, h: 6.0 },
    { model: 'PT-900', label: 'PT-900 护笼爬梯', w: 0.9, h: 9.0 }
  ]
};

export function getModel(type, model) {
  const list = MODELS[type] || [];
  return list.find((m) => m.model === model) || list[0];
}

export function defaultModel(type) {
  return MODELS[type][0].model;
}

// 批量换型号：返回 { oldModel -> newModel } 的可选清单
export function modelsOf(type) {
  return MODELS[type] || [];
}
