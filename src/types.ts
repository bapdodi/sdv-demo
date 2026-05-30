export interface Vehicle {
  vin: string;
  name: string;
  color: string;
  x: number;
  y: number;
  speed: number;
  steer: number;
  accel: number;
  brake: number;
  angle: number;
  road: Road | null;
  isExternal?: boolean;
  connected?: boolean;
  /** 현재 수동 제어(서버 override) 중인지 여부. */
  controlled?: boolean;
}

export interface Road {
  name: string;
  type: string;
  speed_limit: number;
}
