export const HDC_DIMENSION = 10000;

export interface HyperVector {
  id: string;
  dimensions: Int8Array;
  label?: string;
}

export class HyperdimensionalComputer {
  createRandomVector(label?: string): HyperVector {
    const dims = new Int8Array(HDC_DIMENSION);
    for (let i = 0; i < HDC_DIMENSION; i++) {
      dims[i] = Math.random() > 0.5 ? 1 : -1;
    }
    return { id: "hdc_" + Date.now().toString(36), dimensions: dims, label };
  }

  bundle(a: HyperVector, b: HyperVector): HyperVector {
    const result = new Int8Array(HDC_DIMENSION);
    for (let i = 0; i < HDC_DIMENSION; i++) {
      result[i] = (a.dimensions[i] ?? 0) + (b.dimensions[i] ?? 0) > 0 ? 1 : -1;
    }
    return {
      id: "hdc_b_" + Date.now().toString(36),
      dimensions: result,
      label: (a.label ?? "") + "+" + (b.label ?? ""),
    };
  }

  bind(a: HyperVector, b: HyperVector): HyperVector {
    const result = new Int8Array(HDC_DIMENSION);
    for (let i = 0; i < HDC_DIMENSION; i++) {
      result[i] = (a.dimensions[i] ?? 0) * (b.dimensions[i] ?? 0);
    }
    return {
      id: "hdc_x_" + Date.now().toString(36),
      dimensions: result,
      label: (a.label ?? "") + "x" + (b.label ?? ""),
    };
  }

  similarity(a: HyperVector, b: HyperVector): number {
    let dot = 0;
    for (let i = 0; i < HDC_DIMENSION; i++) {
      dot += (a.dimensions[i] ?? 0) * (b.dimensions[i] ?? 0);
    }
    return dot / HDC_DIMENSION;
  }
}
