export interface MapNode {
  id: number;
  x: number;
  y: number;
  name: string;
}

export interface MapEdge {
  id: number;
  from: number;
  to: number;
  name: string;
  type: 'highway' | 'arterial' | 'urban';
  speed_limit: number;
}

// ⚠ 이 맵 데이터는 서버 server/src/map.js 와 동일해야 한다.
//   (브라우저=TS / 서버=JS 런타임이 달라 한 모듈을 공유하지 못하므로 수동 동기화)
//   노드/엣지를 바꾸면 양쪽을 함께 수정할 것.
export const MAP = {
  nodes: [
    { id:0, x:85,  y:240, name:"상암"     },
    { id:1, x:230, y:165, name:"광화문"   },
    { id:2, x:160, y:330, name:"마포"     },
    { id:3, x:255, y:375, name:"여의도"   },
    { id:4, x:430, y:285, name:"강남"     },
    { id:5, x:545, y:270, name:"테헤란로" },
    { id:6, x:595, y:160, name:"잠실"     },
    { id:7, x:635, y:375, name:"판교"     },
    { id:8, x:430, y:385, name:"서초"     },
    { id:9, x:705, y:270, name:"경부IC"   }
  ] as MapNode[],
  edges: [
    { id:0,  from:0, to:1, name:"내부순환로",   type:"urban" as const,    speed_limit:60  },
    { id:1,  from:0, to:2, name:"성산대로",     type:"urban" as const,    speed_limit:60  },
    { id:2,  from:1, to:2, name:"마포대로",     type:"urban" as const,    speed_limit:60  },
    { id:3,  from:1, to:3, name:"여의대로",     type:"arterial" as const, speed_limit:80  },
    { id:4,  from:2, to:3, name:"여의도로",     type:"urban" as const,    speed_limit:60  },
    { id:5,  from:1, to:4, name:"강남대로",     type:"arterial" as const, speed_limit:80  },
    { id:6,  from:3, to:4, name:"올림픽대로",   type:"arterial" as const, speed_limit:80  },
    { id:7,  from:4, to:5, name:"테헤란로",     type:"urban" as const,    speed_limit:60  },
    { id:8,  from:4, to:8, name:"서초대로",     type:"urban" as const,    speed_limit:60  },
    { id:9,  from:5, to:6, name:"동부간선도로", type:"arterial" as const, speed_limit:80  },
    { id:10, from:5, to:7, name:"분당수서로",   type:"arterial" as const, speed_limit:80  },
    { id:11, from:7, to:8, name:"헌릉로",       type:"urban" as const,    speed_limit:60  },
    { id:12, from:5, to:9, name:"경부고속도로", type:"highway" as const,  speed_limit:110 },
    { id:13, from:6, to:9, name:"서울외곽순환", type:"highway" as const,  speed_limit:100 },
    { id:14, from:7, to:9, name:"용인서울고속", type:"highway" as const,  speed_limit:100 }
  ] as MapEdge[],
};

export function node(id: number): MapNode {
  const n = MAP.nodes.find(n => n.id === id);
  if (!n) throw new Error(`Node ${id} not found`);
  return n;
}
