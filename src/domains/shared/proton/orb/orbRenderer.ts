import { FRAGMENT_SHADER, VERTEX_SHADER } from "./orbShader";
import type { OrbLook } from "./orbLook";

/** What one frame of the orb is drawn from. */
export type OrbFrame = {
    /** Seconds since the orb started. */
    time: number;
    /** How far the light has flowed round the ring: time, sped up and slowed down by the mood. */
    phase: number;
    look: OrbLook;
    /** -1 to 1, its breath at this moment. */
    breath: number;
    speak: number;
    bands: readonly [number, number, number];
    /** A syllable's onset, fading out. */
    pulse: number;
    hear: number;
    /** 0 to 1: how far the pointer or keyboard focus has lifted it. */
    hover: number;
    /** 0 on a dark page, 1 on a light one: how its glow is drawn. */
    light: number;
};

export type OrbRenderer = {
    draw: (frame: OrbFrame) => void;
    /** Matches the canvas's pixels to its size on screen: the screen's density, between 2× and 4×. */
    resize: () => void;
    dispose: () => void;
};

const UNIFORMS = ["uRes", "uTime", "uPhase", "uEnergy", "uSwirl", "uGlow", "uDim", "uBreath", "uSpeak", "uBands", "uPulse", "uHear", "uHover", "uLight", "uColA", "uColB", "uColC"] as const;

/** Whether this browser can draw the orb at all (WebGL); the test environment and very old browsers can't. */
export const canDrawOrb = () => typeof window !== "undefined" && typeof window.WebGLRenderingContext !== "undefined";

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    console.warn("Proton's orb shader didn't compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
}

/**
 * The orb's WebGL drawing on a canvas: one program, one triangle covering the canvas, and the uniforms each frame
 * sets. Null when WebGL isn't there or the shader won't build, so the caller can show the classic blob instead.
 */
export function createOrbRenderer(canvas: HTMLCanvasElement): OrbRenderer | null {
    if (!canDrawOrb()) return null;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    // a canvas hands back the same context every time it is asked, lost or not: a lost one can't draw
    if (!gl || gl.isContextLost()) return null;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return null;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.warn("Proton's orb shader didn't link:", gl.getProgramInfoLog(program));
        return null;
    }
    gl.useProgram(program);

    // one triangle larger than the screen covers every pixel
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const at = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
    gl.clearColor(0, 0, 0, 0);

    // drawn at the screen's full density (up to 4×, for 4K screens), and never below 2× (supersampled on ordinary
    // screens), so the ring's edges and its gloss stay sharp
    const resize = () => {
        const scale = Math.min(4, Math.max(2, window.devicePixelRatio || 1));
        const width = Math.max(1, Math.round(canvas.clientWidth * scale));
        const height = Math.max(1, Math.round(canvas.clientHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();

    return {
        draw(frame) {
            const { look } = frame;
            gl.uniform2f(at.uRes, canvas.width, canvas.height);
            gl.uniform1f(at.uTime, frame.time);
            gl.uniform1f(at.uPhase, frame.phase);
            gl.uniform1f(at.uEnergy, look.energy);
            gl.uniform1f(at.uSwirl, look.swirl);
            gl.uniform1f(at.uGlow, look.glow);
            gl.uniform1f(at.uDim, look.dim);
            gl.uniform1f(at.uBreath, frame.breath);
            gl.uniform1f(at.uSpeak, frame.speak);
            gl.uniform3f(at.uBands, frame.bands[0], frame.bands[1], frame.bands[2]);
            gl.uniform1f(at.uPulse, frame.pulse);
            gl.uniform1f(at.uHear, frame.hear);
            gl.uniform1f(at.uHover, frame.hover);
            gl.uniform1f(at.uLight, frame.light);
            gl.uniform3f(at.uColA, ...look.colors[0]);
            gl.uniform3f(at.uColB, ...look.colors[1]);
            gl.uniform3f(at.uColC, ...look.colors[2]);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        resize,
        // frees what was built on the context but leaves the context itself alive: React mounts a component twice in
        // development, and the second mount gets this same canvas, and so this same context, back
        dispose() {
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
        },
    };
}
