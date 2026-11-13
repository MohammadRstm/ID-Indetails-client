/*
 * The orb, drawn by one fragment shader over the whole canvas: a ring of light round a clear, transparent centre. The
 * ring's outline is a circle bent by slow noise; its band thickens and thins as the light flows round it; it glows
 * inside and out; and Proton's voice sends waves round it, the low notes wide and slow, the high ones quick and fine.
 * WebGL 1 (GLSL ES 1.0), so it runs on every browser that has WebGL at all.
 */

export const VERTEX_SHADER = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uPhase;
uniform float uEnergy;
uniform float uSwirl;
uniform float uGlow;
uniform float uDim;
uniform float uBreath;
uniform float uSpeak;
uniform vec3 uBands;
uniform float uPulse;
uniform float uHear;
uniform float uHover;
uniform float uLight;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;

const float PI = 3.14159265;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// noise read round a circle, so it meets itself where the angle wraps: -1 to 1
float ringNoise(float a, float size, float t) {
    vec2 q = vec2(cos(a), sin(a)) * size;
    return noise(q + vec2(t, -0.7 * t)) * 2.0 - 1.0;
}

// how far apart two angles are, the short way round
float angleGap(float a, float b) { return atan(sin(a - b), cos(a - b)); }

void main() {
    float side = min(uRes.x, uRes.y);
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * side);
    float r = length(p);
    float a = atan(p.y, p.x);
    float t = uPhase;

    // the ring's outline: a circle that breathes, bent by slow noise, and by the voices. It sits well inside the
    // canvas, so the glow has room to fade away to nothing before the canvas's edge.
    float radius = 0.36 * (1.0 + 0.018 * uBreath + 0.05 * uSpeak + 0.035 * uHear);
    float wobble = 0.009 + 0.021 * uEnergy;
    float bend = ringNoise(a, 1.3, t * 0.35) * wobble
        + sin(3.0 * a + t * 0.9) * wobble * 0.45
        + sin(2.0 * a - t * 0.6) * wobble * 0.35;
    bend += uSpeak * (uBands.x * 0.036 * sin(2.0 * a + uTime * 3.6)
        + uBands.y * 0.025 * sin(5.0 * a - uTime * 6.5 + 1.6 * ringNoise(a, 2.0, uTime * 0.8))
        + uBands.z * 0.014 * sin(9.0 * a + uTime * 10.5));
    bend += uPulse * 0.02 * sin(4.0 * a - uTime * 5.0);
    bend += uHear * 0.02 * ringNoise(a, 2.4, uTime * 1.4);
    float ring = radius + bend;

    // the ring is a tube of glossy glass: thick where the light gathers, thin elsewhere, as in a liquid ring. Its
    // outline is smoothed over exactly one pixel, so it stays crisp at any size and on any screen.
    float width = 0.026 + 0.016 * (0.5 + 0.5 * sin(2.0 * a - t * 0.7)) + 0.008 * ringNoise(a, 1.7, t * 0.5)
        + 0.014 * uSpeak + 0.005 * uEnergy;
    float d = r - ring;
    float pixel = 2.0 / side;
    float across = clamp(d / width, -1.0, 1.0);
    float tube = 1.0 - smoothstep(width - pixel, width + pixel, abs(d));
    float depth = sqrt(1.0 - across * across);

    // the glows: added light only, fading to nothing in a circle inside the canvas (no square edge where it ends)
    float edge = 1.0 - smoothstep(0.72, 0.96, r);
    float within = max(-d - width, 0.0);
    float beyond = max(d - width, 0.0);
    float innerGlow = (1.0 - smoothstep(-width - pixel, -width + pixel, d)) * exp(-within * 30.0);
    float outerGlow = smoothstep(width - pixel, width + pixel, d) * (exp(-beyond * 12.0) * 0.7 + exp(-beyond * 5.0) * 0.25) * edge;

    // colour flows round the circumference: violet, gathering into magenta, with pink highlights, and a warm
    // reflection low on the left
    float flow = 0.5 + 0.5 * sin(a + t * 0.45 + 1.4 * ringNoise(a, 1.0, t * 0.2));
    float blush = pow(0.5 + 0.5 * sin(2.0 * a - t * 0.8 + 1.7), 3.0);
    vec3 colour = mix(uColA, uColB, flow);
    colour = mix(colour, uColC, blush * 0.6);
    vec2 dir = r > 0.0001 ? p / r : vec2(0.0, 1.0);
    float warm = pow(max(dot(dir, normalize(vec2(-0.85, -0.5))), 0.0), 7.0);
    colour = mix(colour, vec3(1.0, 0.55, 0.45), warm * 0.35);

    // lit as glass: each point across the tube faces its own way. A key light from the top left gives a deep body
    // and one sharp, glossy highlight; a soft magenta light from the bottom right a second, fainter one; and the
    // tube's edges, seen at a glancing angle, brighten as glass does.
    vec3 normal = normalize(vec3(dir * across, depth));
    vec3 key = normalize(vec3(-0.55, 0.83, 1.1));
    vec3 fill = normalize(vec3(0.7, -0.6, 0.8));
    float diffuse = max(dot(normal, key), 0.0);
    float gloss = pow(max(dot(normal, normalize(key + vec3(0.0, 0.0, 1.0))), 0.0), 70.0);
    float soft = pow(max(dot(normal, normalize(fill + vec3(0.0, 0.0, 1.0))), 0.0), 26.0);
    float glance = pow(1.0 - depth, 2.5);

    // thinking: a bright arc circles the ring, a fainter one opposite
    float lead = uTime * 2.3;
    float g1 = angleGap(a, lead);
    float g2 = angleGap(a, lead + PI);
    float swirl = uSwirl * (exp(-g1 * g1 * 5.0) + 0.35 * exp(-g2 * g2 * 5.0));

    // two kinds of light. The tube is solid: it shows on any page. The glows round it are added light only, with
    // no cover of their own: they shine on a dark page and leave a light page untouched, so there is never a smudge.
    float energy = 1.0 + 0.45 * uSpeak + 0.25 * uHear + 0.6 * swirl + 0.3 * uPulse;
    vec3 solid = colour * (0.5 + 0.8 * diffuse) * energy;
    solid += mix(colour, vec3(1.0), 0.5) * glance * 0.55;
    solid += vec3(1.0, 0.97, 1.0) * gloss * (1.15 + 0.4 * uPulse);
    solid += mix(colour, vec3(1.0, 0.8, 0.95), 0.4) * soft * 0.4;
    solid += vec3(1.0, 0.86, 1.0) * swirl * depth * 0.45;
    solid *= tube;
    float fade = 1.0 - 0.2 * (1.0 - smoothstep(0.0, 1.0, uGlow));
    vec3 glow = colour * (innerGlow * 0.35 + outerGlow * uGlow) * (1.0 + 0.4 * uSpeak);

    // under the pointer or keyboard focus: a slight lift, eased in and out (never a CSS filter, which would drop the
    // glow, as it is added light with no cover of its own)
    solid *= 1.0 + 0.06 * uHover;
    glow *= 1.0 + 0.25 * uHover;

    // asleep: dimmer and greyer
    float dimmed = 1.0 - 0.45 * uDim;
    solid = mix(solid, vec3(dot(solid, vec3(0.3, 0.5, 0.2))), uDim * 0.6) * dimmed * fade;
    glow = mix(glow, vec3(dot(glow, vec3(0.3, 0.5, 0.2))), uDim * 0.6) * dimmed * fade;
    solid = max(solid, vec3(0.0)) * edge;
    glow = max(glow, vec3(0.0)) * edge;

    // premultiplied: the tube covers the page wholly (solid glass, its shaded side a deep violet, never see-through).
    // On a dark page the glow is light added on top of it. On a light page added light can't be seen, so there the
    // glow is a vivid tint with a little cover of its own, close to the ring: it still reads as a glow, never a smudge.
    float alpha = clamp(tube * edge, 0.0, 1.0);
    vec3 vivid = mix(colour, vec3(0.72, 0.18, 1.0), 0.35);
    float tint = clamp(max(glow.r, max(glow.g, glow.b)) * 0.8, 0.0, 0.7) * uLight;
    vec3 rgb = solid + glow * (1.0 - uLight) + vivid * tint * (1.0 - alpha);
    gl_FragColor = vec4(min(rgb, vec3(1.0)), alpha + tint * (1.0 - alpha));
}
`;
