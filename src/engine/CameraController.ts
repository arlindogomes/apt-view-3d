import * as pc from 'playcanvas';
import { CameraMode } from '../types/scene';

export class CameraController {
  private cameraEntity: pc.Entity;
  private canvas: HTMLCanvasElement;
  private mode: CameraMode = 'perspective';

  // Orbit state
  private target = new pc.Vec3(0, 0.8, 0);
  private targetGoal = new pc.Vec3(0, 0.8, 0);
  private yaw = 38;
  private pitch = 32;
  private distance = 12;
  private distanceGoal = 12;

  // Top 2D ortho state
  private orthoPos = new pc.Vec3(0, 20, 0);
  private orthoHeight = 7.5;
  private orthoHeightGoal = 7.5;

  // First-person walk-through state (eye height 1.65m)
  private fpsPos = new pc.Vec3(0, 1.65, 4.5);
  private fpsYaw = 0;
  private fpsPitch = -4;
  private keys = new Set<string>();

  // Pointer tracking
  private isDragging = false;
  private dragButton = -1;
  private lastX = 0;
  private lastY = 0;
  private isSuppressed = false; // suppressed while dragging gizmo or drawing wall

  constructor(cameraEntity: pc.Entity, canvas: HTMLCanvasElement) {
    this.cameraEntity = cameraEntity;
    this.canvas = canvas;
    this.attachEvents();
    this.applyCameraImmediate();
  }

  public setSuppressed(suppressed: boolean): void {
    this.isSuppressed = suppressed;
    if (suppressed) {
      this.isDragging = false;
    }
  }

  public setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    const cam = this.cameraEntity.camera!;

    if (mode === 'top2d') {
      cam.projection = pc.PROJECTION_ORTHOGRAPHIC;
      cam.orthoHeight = this.orthoHeight;
      this.orthoPos.set(this.target.x, 22, this.target.z);
    } else if (mode === 'fps') {
      cam.projection = pc.PROJECTION_PERSPECTIVE;
      cam.fov = 65;
      this.fpsPos.y = 1.65;
    } else {
      cam.projection = pc.PROJECTION_PERSPECTIVE;
      cam.fov = 48;
    }
    this.applyCameraImmediate();
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public focusOnPoint(point: pc.Vec3, radius = 2.5): void {
    if (this.mode === 'top2d') {
      this.orthoPos.x = point.x;
      this.orthoPos.z = point.z;
      this.orthoHeightGoal = Math.max(2.5, radius * 2.2);
    } else if (this.mode === 'fps') {
      this.fpsPos.set(point.x, 1.65, point.z + Math.max(2.2, radius * 1.6));
      this.fpsYaw = 0;
      this.fpsPitch = -5;
    } else {
      this.targetGoal.copy(point);
      this.distanceGoal = Math.max(3.0, Math.min(25, radius * 2.8));
    }
  }

  public update(dt: number): void {
    const smooth = Math.min(1, dt * 10);

    if (this.mode === 'perspective') {
      this.target.lerp(this.target, this.targetGoal, smooth);
      this.distance += (this.distanceGoal - this.distance) * smooth;

      const radYaw = this.yaw * pc.math.DEG_TO_RAD;
      const radPitch = this.pitch * pc.math.DEG_TO_RAD;

      const cx = this.target.x + this.distance * Math.cos(radPitch) * Math.sin(radYaw);
      const cy = this.target.y + this.distance * Math.sin(radPitch);
      const cz = this.target.z + this.distance * Math.cos(radPitch) * Math.cos(radYaw);

      this.cameraEntity.setPosition(cx, Math.max(0.2, cy), cz);
      this.cameraEntity.lookAt(this.target);
    } else if (this.mode === 'top2d') {
      this.orthoHeight += (this.orthoHeightGoal - this.orthoHeight) * smooth;
      const cam = this.cameraEntity.camera;
      if (cam) {
        cam.orthoHeight = this.orthoHeight;
      }
      this.cameraEntity.setPosition(this.orthoPos.x, 22, this.orthoPos.z);
      this.cameraEntity.setEulerAngles(-90, 0, 0);
    } else if (this.mode === 'fps') {
      const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 6.0 : 3.2) * dt;
      const forward = new pc.Vec3(
        -Math.sin(this.fpsYaw * pc.math.DEG_TO_RAD),
        0,
        -Math.cos(this.fpsYaw * pc.math.DEG_TO_RAD)
      );
      const right = new pc.Vec3(
        Math.cos(this.fpsYaw * pc.math.DEG_TO_RAD),
        0,
        -Math.sin(this.fpsYaw * pc.math.DEG_TO_RAD)
      );

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) {
        this.fpsPos.add(forward.clone().mulScalar(speed));
      }
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) {
        this.fpsPos.sub(forward.clone().mulScalar(speed));
      }
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) {
        this.fpsPos.add(right.clone().mulScalar(speed));
      }
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) {
        this.fpsPos.sub(right.clone().mulScalar(speed));
      }

      this.fpsPos.y = 1.65;
      this.cameraEntity.setPosition(this.fpsPos);
      this.cameraEntity.setEulerAngles(this.fpsPitch, this.fpsYaw, 0);
    }
  }

  private applyCameraImmediate(): void {
    this.update(1);
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.isSuppressed) return;
    // Left-click orbits in perspective/fps (if not consumed by tool), right/middle always orbits/pans
    if (e.button === 0 || e.button === 1 || e.button === 2) {
      this.isDragging = true;
      this.dragButton = e.button;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging || this.isSuppressed) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.mode === 'perspective') {
      const isPan = this.dragButton === 1 || (this.dragButton === 2 && e.shiftKey) || (this.dragButton === 0 && e.shiftKey);
      if (isPan) {
        const panScale = this.distance * 0.0018;
        const right = this.cameraEntity.right.clone();
        const up = this.cameraEntity.up.clone();
        this.targetGoal.sub(right.mulScalar(dx * panScale));
        this.targetGoal.add(up.mulScalar(dy * panScale));
      } else if (this.dragButton === 2 || this.dragButton === 0) {
        this.yaw -= dx * 0.32;
        this.pitch = Math.max(4, Math.min(86, this.pitch + dy * 0.28));
      }
    } else if (this.mode === 'top2d') {
      const rect = this.canvas.getBoundingClientRect();
      const worldPerPx = (this.orthoHeight * 2) / Math.max(1, rect.height);
      this.orthoPos.x -= dx * worldPerPx;
      this.orthoPos.z -= dy * worldPerPx;
    } else if (this.mode === 'fps') {
      this.fpsYaw -= dx * 0.24;
      this.fpsPitch = Math.max(-75, Math.min(75, this.fpsPitch - dy * 0.24));
    }
  };

  private onPointerUp = () => {
    this.isDragging = false;
    this.dragButton = -1;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.12 : 0.89;
    if (this.mode === 'perspective') {
      this.distanceGoal = Math.max(1.5, Math.min(45, this.distanceGoal * factor));
    } else if (this.mode === 'top2d') {
      this.orthoHeightGoal = Math.max(1.5, Math.min(35, this.orthoHeightGoal * factor));
    } else if (this.mode === 'fps') {
      const forward = new pc.Vec3(
        -Math.sin(this.fpsYaw * pc.math.DEG_TO_RAD),
        0,
        -Math.cos(this.fpsYaw * pc.math.DEG_TO_RAD)
      );
      this.fpsPos.add(forward.mulScalar(e.deltaY > 0 ? -0.5 : 0.5));
    }
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private attachEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
