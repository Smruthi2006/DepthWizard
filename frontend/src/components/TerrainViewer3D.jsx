import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

/**
 * TerrainViewer3D - High-Fidelity Interactive 3D WebGL Terrain & Flythrough Engine
 * Built with Three.js for ISRO SAC SIH 26175 DepthWizard
 */
export default function TerrainViewer3D({
  meshData,
  textures,
  activeLayer = 'optical',
  verticalScale = 1.0,
  wireframe = false,
  showContours = false,
  flythroughMode = 'orbit', // 'orbit', 'drone', 'cinematic', 'ortho'
  sunAngle = 45,
  sunAzimuth = 135,
  measureMode = false,
  onPointClicked,
  onMeasureComplete
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const terrainMeshRef = useRef(null);
  const textureCacheRef = useRef({});
  const markersRef = useRef([]);
  const measureLineRef = useRef(null);
  const measurePointsRef = useRef([]);

  // Animation & Control state refs
  const isDraggingRef = useRef(false);
  const prevMouseRef = useRef({ x: 0, y: 0 });
  const orbitStateRef = useRef({ theta: Math.PI / 4, phi: Math.PI / 4, radius: 280, target: new THREE.Vector3(0, 0, 0) });
  const droneStateRef = useRef({
    position: new THREE.Vector3(0, 50, 100),
    yaw: 0,
    pitch: -0.2,
    keys: { w: false, a: false, s: false, d: false, q: false, e: false }
  });
  const cinematicClockRef = useRef(0);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    sceneRef.current = scene;

    // Fog for depth realism
    scene.fog = new THREE.FogExp2(0x05070c, 0.0015);

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 8000);
    camera.position.set(0, 180, 240);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting (Simulating Sun & Sky Ambient)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff8eb, 1.3);
    sunLight.position.set(150, 250, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 1000;
    const d = 160;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);
    scene.sunLight = sunLight;

    // Blue sky bounce light
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.35);
    scene.add(hemiLight);

    // 5. Grid helper (at base)
    const grid = new THREE.GridHelper(400, 20, 0x00e5ff, 0x1e293b);
    grid.position.y = -2;
    scene.add(grid);

    // Resize Handler
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 6. Animation Loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Handle Camera Modes
      if (flythroughMode === 'cinematic') {
        cinematicClockRef.current += 0.0035;
        const t = cinematicClockRef.current;
        const radius = 170;
        const camX = Math.sin(t) * radius;
        const camZ = Math.cos(t) * radius;
        const camY = 65 + Math.sin(t * 2.0) * 20;

        camera.position.set(camX, camY, camZ);
        camera.lookAt(0, 10 + Math.sin(t) * 15, 0);
      } else if (flythroughMode === 'drone') {
        const d = droneStateRef.current;
        const speed = 1.2;
        const forward = new THREE.Vector3(-Math.sin(d.yaw), 0, -Math.cos(d.yaw));
        const right = new THREE.Vector3(Math.cos(d.yaw), 0, -Math.sin(d.yaw));

        if (d.keys.w) d.position.addScaledVector(forward, speed);
        if (d.keys.s) d.position.addScaledVector(forward, -speed);
        if (d.keys.d) d.position.addScaledVector(right, speed);
        if (d.keys.a) d.position.addScaledVector(right, -speed);
        if (d.keys.e) d.position.y += speed * 0.8;
        if (d.keys.q) d.position.y -= speed * 0.8;

        camera.position.copy(d.position);
        const lookDir = new THREE.Vector3(
          -Math.sin(d.yaw) * Math.cos(d.pitch),
          Math.sin(d.pitch),
          -Math.cos(d.yaw) * Math.cos(d.pitch)
        );
        camera.lookAt(camera.position.clone().add(lookDir));
      } else if (flythroughMode === 'ortho') {
        camera.position.set(0, 320, 0.01);
        camera.lookAt(0, 0, 0);
      } else {
        // Orbit Mode
        const o = orbitStateRef.current;
        camera.position.x = o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta);
        camera.position.y = o.target.y + o.radius * Math.cos(o.phi);
        camera.position.z = o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta);
        camera.lookAt(o.target);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update Sun Lighting
  useEffect(() => {
    if (!sceneRef.current?.sunLight) return;
    const sun = sceneRef.current.sunLight;
    const radAz = (sunAzimuth * Math.PI) / 180;
    const radAlt = (sunAngle * Math.PI) / 180;
    const dist = 300;
    sun.position.set(
      dist * Math.cos(radAlt) * Math.sin(radAz),
      dist * Math.sin(radAlt),
      dist * Math.cos(radAlt) * Math.cos(radAz)
    );
  }, [sunAngle, sunAzimuth]);

  // Build / Update 3D Terrain Mesh Geometry
  useEffect(() => {
    if (!sceneRef.current || !meshData || !meshData.elevations) return;

    const scene = sceneRef.current;
    const { grid_size, elevations, min_elevation, max_elevation } = meshData;
    const width = 200;
    const height = 200;

    // Remove existing terrain mesh if present
    if (terrainMeshRef.current) {
      scene.remove(terrainMeshRef.current);
      terrainMeshRef.current.geometry.dispose();
      terrainMeshRef.current = null;
    }

    const geometry = new THREE.PlaneGeometry(width, height, grid_size - 1, grid_size - 1);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const elevRange = max_elevation - min_elevation || 1.0;
    // Scale vertical displacement to visually appealing relief
    const zBase = min_elevation;
    const heightScale = (40.0 / Math.max(15.0, elevRange)) * verticalScale;

    for (let i = 0; i < pos.count; i++) {
      const elev = elevations[i] !== undefined ? elevations[i] : min_elevation;
      const displacedY = (elev - zBase) * heightScale;
      pos.setY(i, displacedY);
    }

    geometry.computeVertexNormals();

    // Default Material
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.85,
      metalness: 0.1,
      wireframe: wireframe,
      side: THREE.DoubleSide
    });

    const terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    terrainMesh.userData = { isTerrain: true, meshData };
    scene.add(terrainMesh);
    terrainMeshRef.current = terrainMesh;
  }, [meshData, verticalScale, wireframe]);

  // Load and Apply Active Texture Layer
  useEffect(() => {
    if (!terrainMeshRef.current || !textures) return;

    const textureUrl = textures[activeLayer] || textures.optical;
    if (!textureUrl) return;

    const material = terrainMeshRef.current.material;

    if (textureCacheRef.current[textureUrl]) {
      material.map = textureCacheRef.current[textureUrl];
      material.needsUpdate = true;
    } else {
      const loader = new THREE.TextureLoader();
      loader.load(
        textureUrl,
        (tex) => {
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = 16;
          textureCacheRef.current[textureUrl] = tex;
          if (terrainMeshRef.current) {
            terrainMeshRef.current.material.map = tex;
            terrainMeshRef.current.material.needsUpdate = true;
          }
        },
        undefined,
        (err) => console.error('Failed to load texture layer:', err)
      );
    }
  }, [textures, activeLayer]);

  // Mouse & Keyboard Interaction Handlers
  const handleMouseDown = (e) => {
    if (e.button === 0) { // Left click
      isDraggingRef.current = true;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - prevMouseRef.current.x;
    const dy = e.clientY - prevMouseRef.current.y;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };

    if (flythroughMode === 'drone') {
      const d = droneStateRef.current;
      d.yaw -= dx * 0.003;
      d.pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, d.pitch - dy * 0.003));
    } else if (flythroughMode === 'orbit') {
      const o = orbitStateRef.current;
      o.theta -= dx * 0.006;
      o.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, o.phi - dy * 0.006));
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e) => {
    if (flythroughMode === 'orbit') {
      const o = orbitStateRef.current;
      o.radius = Math.max(30, Math.min(600, o.radius + e.deltaY * 0.25));
    }
  };

  // Keyboard navigation for drone mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
        droneStateRef.current.keys[key] = true;
      }
    };
    const handleKeyUp = (e) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'q', 'e'].includes(key)) {
        droneStateRef.current.keys[key] = false;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Click on Terrain for Height Query or 2-Point Measurement
  const handleClick = (e) => {
    if (!mountRef.current || !cameraRef.current || !terrainMeshRef.current) return;

    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);
    const intersects = raycaster.intersectObject(terrainMeshRef.current);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const pt = hit.point;
      const uv = hit.uv;

      // Calculate pixel coordinates
      const pixelX = Math.round(uv.x * 511);
      const pixelY = Math.round((1 - uv.y) * 511);

      if (measureMode) {
        handleMeasurePoint(pt, { x: pixelX, y: pixelY });
      } else {
        // Place single point pin
        placeMarker(pt, 0x00e5ff);
        if (onPointClicked) {
          onPointClicked({ x: pixelX, y: pixelY, point3D: pt });
        }
      }
    }
  };

  const placeMarker = (point, color = 0x00e5ff) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear old single pin if not in measure mode
    if (!measureMode) {
      markersRef.current.forEach((m) => scene.remove(m));
      markersRef.current = [];
    }

    const pinGeo = new THREE.SphereGeometry(2.0, 16, 16);
    const pinMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.8
    });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.copy(point);
    pin.position.y += 2.0; // slight offset above surface
    scene.add(pin);
    markersRef.current.push(pin);
  };

  const handleMeasurePoint = (point3D, pixel) => {
    const pts = measurePointsRef.current;
    placeMarker(point3D, pts.length === 0 ? 0x00e5ff : 0xff9100);
    pts.push({ point3D, pixel });

    if (pts.length === 2) {
      const p1 = pts[0].point3D;
      const p2 = pts[1].point3D;

      // Draw 3D connecting laser line
      const scene = sceneRef.current;
      if (measureLineRef.current) scene.remove(measureLineRef.current);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffea00, linewidth: 3 });
      const line = new THREE.Line(lineGeo, lineMat);
      scene.add(line);
      measureLineRef.current = line;

      // Calculate metrics
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dz = p2.z - p1.z;
      const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      const slopeDeg = (Math.atan2(Math.abs(dy), Math.max(0.001, horizDist)) * 180) / Math.PI;

      if (onMeasureComplete) {
        onMeasureComplete({
          p1_pixel: pts[0].pixel,
          p2_pixel: pts[1].pixel,
          dist_3d_m: dist3D.toFixed(2),
          horiz_dist_m: horizDist.toFixed(2),
          height_diff_m: Math.abs(dy).toFixed(2),
          slope_deg: slopeDeg.toFixed(1)
        });
      }

      measurePointsRef.current = [];
    }
  };

  return (
    <div
      ref={mountRef}
      className="viewport-container"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={handleClick}
      tabIndex={0}
    />
  );
}
