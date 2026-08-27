// Babylon.js display layer: the 256x240 game canvas becomes a dynamic texture
// on a fullscreen quad, letterboxed at an integer scale so pixels stay square.

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

import { VIEW_H, VIEW_W } from "./config";

export class Display {
  readonly engine: Engine;
  readonly scene: Scene;
  private texture: DynamicTexture;
  private quad: Mesh;
  private camera: FreeCamera;

  constructor(
    private hostCanvas: HTMLCanvasElement,
    private source: HTMLCanvasElement,
  ) {
    this.engine = new Engine(hostCanvas, false, {
      preserveDrawingBuffer: true,
      stencil: false,
      antialias: false,
    });
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 1);

    this.camera = new FreeCamera("cam", new Vector3(0, 0, -10), this.scene);
    this.camera.setTarget(Vector3.Zero());
    this.camera.mode = 1; // ORTHOGRAPHIC_CAMERA

    this.quad = MeshBuilder.CreatePlane("screen", { width: VIEW_W, height: VIEW_H }, this.scene);

    this.texture = new DynamicTexture(
      "screenTex",
      { width: VIEW_W, height: VIEW_H },
      this.scene,
      false,
      Texture.NEAREST_SAMPLINGMODE,
    );
    this.texture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.texture.wrapV = Texture.CLAMP_ADDRESSMODE;
    // Canvas Y grows downward, texture V grows upward — without this the whole
    // screen renders upside down.
    this.texture.vScale = -1;
    this.texture.vOffset = 1;

    const mat = new StandardMaterial("screenMat", this.scene);
    mat.diffuseTexture = this.texture;
    mat.emissiveTexture = this.texture;
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 1, 1);
    mat.specularColor = new Color3(0, 0, 0);
    this.quad.material = mat;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /** Fit the virtual screen inside the window at whole-pixel scale. */
  private resize(): void {
    this.engine.resize();
    const w = this.engine.getRenderWidth();
    const h = this.engine.getRenderHeight();
    const scale = Math.max(1, Math.min(w / VIEW_W, h / VIEW_H));
    // Orthographic half-extents in the same units as the quad's size.
    const halfH = (VIEW_H / 2) * (h / (VIEW_H * scale));
    const halfW = (VIEW_W / 2) * (w / (VIEW_W * scale));
    this.camera.orthoLeft = -halfW;
    this.camera.orthoRight = halfW;
    this.camera.orthoTop = halfH;
    this.camera.orthoBottom = -halfH;
    this.hostCanvas.style.imageRendering = "pixelated";
  }

  /** Copy this frame's pixels to the GPU. */
  present(): void {
    const ctx = this.texture.getContext() as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.drawImage(this.source, 0, 0);
    this.texture.update(false);
    this.scene.render();
  }
}
