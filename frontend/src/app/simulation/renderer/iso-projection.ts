export class IsoProjection {
  private scaleVal = 1;
  private offsetX = 0;
  private offsetY = 0;

  resize(canvasWidth: number, canvasHeight: number, worldSize: number): void {
    const margin = 0.9;
    const scaleByWidth = (canvasWidth * margin) / worldSize;
    const scaleByHeight = (canvasHeight * margin) / worldSize;
    this.scaleVal = Math.min(scaleByWidth, scaleByHeight);

    // Center the world in the canvas
    this.offsetX = (canvasWidth - worldSize * this.scaleVal) / 2;
    this.offsetY = (canvasHeight - worldSize * this.scaleVal) / 2;
  }

  worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return {
      sx: wx * this.scaleVal + this.offsetX,
      sy: wy * this.scaleVal + this.offsetY,
    };
  }

  /** In top-down view, height is ignored */
  worldToScreenH(wx: number, wy: number, _wh: number): { sx: number; sy: number } {
    return this.worldToScreen(wx, wy);
  }

  screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    return {
      wx: (sx - this.offsetX) / this.scaleVal,
      wy: (sy - this.offsetY) / this.scaleVal,
    };
  }

  /** Pixels per world unit */
  get scale(): number {
    return this.scaleVal;
  }
}
