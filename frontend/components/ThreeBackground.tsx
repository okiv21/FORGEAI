"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A Moonshot-style eclipse: a dark sphere against black whose edge catches a
 * bright, faintly spectral rim of light (chromatic fresnel). Slowly breathes and
 * rotates. Kept deliberately light for weak GPUs: one sphere, a small shader,
 * capped pixel ratio, paused when the tab is hidden or reduced-motion is set.
 */
export function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const w = () => el.clientWidth;
    const h = () => el.clientHeight;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w() / h(), 0.1, 100);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(w(), h());
    el.appendChild(renderer.domElement);

    const uniforms = { uTime: { value: 0 } };
    const geometry = new THREE.SphereGeometry(1.7, 96, 96);
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        uniform float uTime;
        void main() {
          float d = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
          float f = 1.0 - d;                       // fresnel: bright at the rim
          // Split the rim into R/G/B at slightly different falloffs -> a subtle
          // chromatic-aberration light bend, like the Moonshot hero.
          float r = pow(f, 3.4);
          float g = pow(f, 3.9);
          float b = pow(f, 2.7);
          vec3 rim = vec3(r, g, b);
          float shimmer = 0.12 * sin(uTime * 0.5 + vNormal.y * 3.5 + vNormal.x * 2.0);
          rim += shimmer * vec3(0.25, 0.15, 0.4) * f;
          vec3 base = vec3(0.015, 0.015, 0.02);
          vec3 col = base + rim * 1.7;
          float alpha = clamp(r + g + b, 0.0, 1.0) * 0.96 + 0.04;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(1.35, -0.15, 0);
    scene.add(sphere);

    const clock = new THREE.Clock();
    let raf = 0;
    const render = () => {
      const t = clock.getElapsedTime();
      uniforms.uTime.value = t;
      if (!reduced) {
        sphere.rotation.y += 0.0008;
        sphere.position.y = -0.15 + Math.sin(t * 0.25) * 0.06; // gentle breathing
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    const onResize = () => {
      camera.aspect = w() / h();
      camera.updateProjectionMatrix();
      renderer.setSize(w(), h());
    };
    window.addEventListener("resize", onResize);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) render();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0" aria-hidden="true" />;
}
