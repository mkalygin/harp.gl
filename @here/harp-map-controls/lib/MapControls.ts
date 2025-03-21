/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as geoUtils from "@here/harp-geoutils";
import { MapView, MapViewEventNames, MapViewUtils } from "@here/harp-mapview";
import * as THREE from "three";
import * as utils from "./Utils";

enum State {
    NONE,
    PAN,
    ROTATE,
    ORBIT,
    TOUCH
}

export enum TiltState {
    Tilted,
    Down
}

interface TouchState {
    currentTouchPoint: THREE.Vector2;
    lastTouchPoint: THREE.Vector2;
    currentWorldPosition: THREE.Vector3;
    initialWorldPosition: THREE.Vector3;
}

/**
 * Map interaction events' names.
 */
export enum EventNames {
    Update = "update",
    BeginInteraction = "begin-interaction",
    EndInteraction = "end-interaction"
}

// cast needed to workaround wrong three.js typings.
const MAPCONTROL_EVENT: THREE.Event = { type: EventNames.Update } as any;
const MAPCONTROL_EVENT_BEGIN_INTERACTION: THREE.Event = {
    type: EventNames.BeginInteraction
} as any;
const MAPCONTROL_EVENT_END_INTERACTION: THREE.Event = {
    type: EventNames.EndInteraction
} as any;

/**
 * Yaw rotation as quaternion. Declared as a const to avoid object re-creation across frames.
 */
const yawQuaternion = new THREE.Quaternion();
/**
 * Pitch rotation as quaternion. Declared as a const to avoid object re-creation across frames.
 */
const pitchQuaternion = new THREE.Quaternion();

/**
 * The yaw axis around which we rotate when we change the yaw.
 * This axis is fixed and is the -Z axis `(0,0,1)`.
 */
const yawAxis = new THREE.Vector3(0, 0, 1);
/**
 * The pitch axis which we use to rotate around when we change the pitch.
 * The axis is fix and is the +X axis `(1,0,0)`.
 */
const pitchAxis = new THREE.Vector3(1, 0, 0);

/**
 * The number of the steps for which, when pitching the camera, the delta altitude is scaled until
 * it reaches the minimum camera height.
 */
const MAX_DELTA_ALTITUDE_STEPS = 10;

/**
 * The number of user's inputs to consider for panning inertia, to reduce erratic inputs.
 */
const USER_INPUTS_TO_CONSIDER = 5;

/**
 * The default maximum for the camera pitch. This value avoids seeing the horizon.
 */
const DEFAULT_MAX_PITCH_ANGLE = Math.PI / 4;

/**
 * Epsilon value to rule out when a number can be considered 0.
 */
const EPSILON = 0.01;

/**
 * Maximum duration between start and end touch events to define a finger tap.
 */
const MAX_TAP_DURATION = 120;

/**
 * This map control provides basic map-related building blocks to interact with the map. It also
 * provides a default way of handling user input. Currently we support basic mouse interaction and
 * touch input interaction.
 *
 * Mouse interaction:
 *  - Left mouse button + move = Panning the map.
 *  - Right mouse button + move = Orbits the camera around the focus point.
 *  - Middle mouse button + move = Rotating the view. Up down movement changes the pitch. Left/right
 *    movement changes the yaw.
 *  - Mouse wheel = Zooms up and down by one zoom level, zooms on target.
 *
 * Touch interaction:
 *  - One finger = Panning the map.
 *  - Two fingers = Scale, rotate and panning the map.
 *  - Three fingers = Orbiting the map. Up down movements influences the current orbit altitude.
 *    Left/right changes the azimuth.
 */
export class MapControls extends THREE.EventDispatcher {
    /**
     * Creates MapControls object and attaches it specified [[MapView]].
     *
     * @param mapView - [[MapView]] object to which MapControls should be attached to.
     */
    static create(mapView: MapView) {
        return new MapControls(mapView);
    }

    /**
     * This factor will be applied to the delta of the current mouse pointer position and the last
     * mouse pointer position: The result then will be used as an offset for the rotation then.
     * Default value is `0.1`.
     */
    rotationMouseDeltaFactor = 0.1;

    /**
     * This factor will be applied to the delta of the current mouse pointer position and the last
     * mouse pointer position: The result then will be used as an offset to orbit the camera.
     * Default value is `0.1`.
     */
    orbitingMouseDeltaFactor = 0.1;

    /**
     * This factor will be applied to the delta of the current touch pointer position and the last
     * touch pointer position: The result then will be used as an offset to orbit the camera.
     * Default value is `0.1`.
     */
    orbitingTouchDeltaFactor = 0.1;

    /**
     * Set to `true` to enable input handling through this map control, `false` to disable input
     * handling. Even when disabling input handling, you can manually use the public functions to
     * change the view to the current map.
     */
    enabled = true;

    /**
     * Set to `true` to enable orbiting and Pitch axis rotation through this map control, `false` to
     * disable orbiting and Pitch axis rotation.
     */
    tiltEnabled = true;

    /**
     * Set to `true` to enable rotation through this map control, `false` to disable rotation.
     */
    rotateEnabled = true;

    /**
     * Set to `true` to enable an inertia dampening on zooming and panning. `false` cancels inertia.
     */
    inertiaEnabled = true;

    /**
     * Inertia damping duration for the zoom, in seconds.
     */
    zoomInertiaDampingDuration = 0.5;

    /**
     * Inertia damping duration for the panning, in seconds.
     */
    panInertiaDampingDuration = 1.0;

    /**
     * Duration in seconds of the camera animation when the tilt button is clicked. Independent of
     * inertia.
     */
    tiltToggleDuration = 0.5;

    /**
     * Camera pitch target when tilting it from the UI button.
     */
    tiltAngle = Math.PI / 4;

    /**
     * Determines the zoom level delta for single mouse wheel movement. So after each mouse wheel
     * movement the current zoom level will be added or subtracted by this value. The default value
     * is `0.2` - this means that every 5th mouse wheel movement you will cross a zoom level.
     *
     * **Note**: To reverse the zoom direction, you can provide a negative value.
     */
    zoomLevelDeltaOnMouseWheel = 0.2;

    /**
     * Zoom level delta when using the UI controls.
     */
    zoomLevelDeltaOnControl = 1.0;

    /**
     * Determines the minimum zoom level we can zoom to.
     */
    minZoomLevel = 0;

    /**
     * Determines the maximum zoom level we can zoom to.
     */
    maxZoomLevel = 20;

    /**
     * Determines the minimum camera height in meter.
     */
    minCameraHeight = 3;

    /**
     * Zoom level delta to apply when double clicking or double tapping. `0` disables the feature.
     */
    zoomLevelDeltaOnDoubleClick = 1.0;

    /**
     * Double click uses the OS delay through the double click event. Tapping is implemented locally
     * here in `MapControls` with this duration setting the maximum delay to define a double tap.
     * The value is in seconds. `300ms` is picked as the default value as jQuery does.
     */
    doubleTapTime = 0.3;

    /**
     * Three.js camera that this controller affects.
     */
    readonly camera: THREE.Camera;

    /**
     * Map's HTML DOM element.
     */
    readonly domElement: HTMLCanvasElement;

    private readonly m_currentViewDirection = new THREE.Vector3();

    private readonly m_lastMousePosition = new THREE.Vector2(0, 0);
    private readonly m_mouseDelta = new THREE.Vector2(0, 0);

    private m_needsRenderLastFrame: boolean = true;

    private m_panIsAnimated: boolean = false;
    private m_panDistanceFrameDelta: THREE.Vector3 = new THREE.Vector3();
    private m_panAnimationTime: number = 0;
    private m_panAnimationStartTime: number = 0;
    private m_lastAveragedPanDistanceOrAngle: number = 0;
    private m_currentInertialPanningSpeed: number = 0;
    private m_lastPanVector: THREE.Vector3 = new THREE.Vector3();
    private m_rotateGlobeQuaternion: THREE.Quaternion = new THREE.Quaternion();
    private m_lastRotateGlobeAxis: THREE.Vector3 = new THREE.Vector3();
    private m_lastRotateGlobeAngle: number = 0;
    private m_lastRotateGlobeFromVector: THREE.Vector3 = new THREE.Vector3();
    private m_recentPanDistancesOrAngles: [number, number, number, number, number] = [
        0,
        0,
        0,
        0,
        0
    ];
    private m_currentPanDistanceOrAngleIndex: number = 0;

    private m_zoomIsAnimated: boolean = false;
    private m_zoomDeltaRequested: number = 0;
    private m_zoomTargetNormalizedCoordinates: THREE.Vector2 = new THREE.Vector2();
    private m_zoomAnimationTime: number = 0;
    private m_zoomAnimationStartTime: number = 0;
    private m_startZoom: number = 0;
    private m_targetedZoom?: number;
    private m_currentZoom?: number;

    private m_tiltIsAnimated: boolean = false;
    private m_pitchRequested?: number = undefined;
    private m_tiltAnimationTime: number = 0;
    private m_tiltAnimationStartTime: number = 0;
    private m_startPitch: number = 0;
    private m_targetedPitch?: number;
    private m_currentPitch?: number;

    private m_tiltState?: TiltState;
    private m_state: State = State.NONE;

    private m_tmpVector2: THREE.Vector2 = new THREE.Vector2();
    private m_tmpVector3: THREE.Vector3 = new THREE.Vector3();

    private m_tapStartTime: number = 0;
    private m_lastSingleTapTime: number = 0;
    private m_fingerMoved: boolean = false;
    private m_isDoubleTap: boolean = false;

    /**
     * Determines the minimum angle the camera can pitch to. It is defined in radians.
     */
    private m_minPitchAngle = 0;

    /**
     * Determines the maximum angle the camera can pitch to. It is defined in radians.
     */
    private m_maxPitchAngle = DEFAULT_MAX_PITCH_ANGLE;

    private m_cleanupMouseEventListeners?: () => void;

    private m_touchState: {
        touches: TouchState[];
        currentRotation: number;
        initialRotation: number;
    } = {
        touches: [],
        currentRotation: 0,
        initialRotation: 0
    };

    /**
     * Constructs a new `MapControls` object.
     *
     * @param mapView [[MapView]] this controller modifies.Z
     */
    constructor(readonly mapView: MapView) {
        super();

        this.camera = mapView.camera;
        this.domElement = mapView.renderer.domElement;
        this.maxZoomLevel = mapView.maxZoomLevel;
        this.minZoomLevel = mapView.minZoomLevel;
        this.minCameraHeight = mapView.minCameraHeight;
        this.bindInputEvents(this.domElement);
        this.handleZoom = this.handleZoom.bind(this);
        this.handlePan = this.handlePan.bind(this);
        this.tilt = this.tilt.bind(this);
        this.assignZoomAfterTouchZoomRender = this.assignZoomAfterTouchZoomRender.bind(this);
    }

    /**
     * Destroy this `MapControls` instance.
     *
     * Unregisters all global event handlers used. This is method should be called when you stop
     * using `MapControls`.
     */
    dispose = () => {
        // replaced with real code in bindInputEvents
    };

    /**
     * Rotates the camera by the given delta yaw and delta pitch.
     *
     * @param deltaYaw Delta yaw in degrees.
     * @param deltaPitch Delta pitch in degrees.
     */
    rotate(deltaYaw: number, deltaPitch: number = 0) {
        if (this.inertiaEnabled && this.m_zoomIsAnimated) {
            this.stopZoom();
        }
        if (this.mapView.projection.type !== geoUtils.ProjectionType.Planar) {
            return;
        }
        const yawPitchRoll = MapViewUtils.extractYawPitchRoll(
            this.camera.quaternion,
            this.mapView.projection.type
        );

        //yaw
        let yawAngle = yawPitchRoll.yaw;
        if (this.rotateEnabled) {
            yawAngle -= THREE.Math.degToRad(deltaYaw);
        }
        yawQuaternion.setFromAxisAngle(yawAxis, yawAngle);

        //pitch
        const deltaPitchRadians = THREE.Math.degToRad(deltaPitch);
        const pitchAngle = this.constrainPitchAngle(yawPitchRoll.pitch, deltaPitchRadians);
        pitchQuaternion.setFromAxisAngle(pitchAxis, pitchAngle);

        yawQuaternion.multiply(pitchQuaternion);
        this.mapView.camera.quaternion.copy(yawQuaternion);
        this.mapView.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Current viewing angles yaw/pitch/roll in degrees.
     */
    get yawPitchRoll(): MapViewUtils.YawPitchRoll {
        const ypr = MapViewUtils.extractYawPitchRoll(
            this.camera.quaternion,
            this.mapView.projection.type
        );
        return {
            yaw: THREE.Math.radToDeg(ypr.yaw),
            pitch: THREE.Math.radToDeg(ypr.pitch),
            roll: THREE.Math.radToDeg(ypr.roll)
        };
    }

    /*
     * Orbits the camera around the focus point of the camera. The `deltaAzimuth` and
     * `deltaAltitude` are offsets in degrees to the current azimuth and altitude of the current
     * orbit.
     *
     * @param deltaAzimuth Delta azimuth in degrees.
     * @param deltaAltitude Delta altitude in degrees.
     */
    orbitFocusPoint(deltaAzimuth: number, deltaAltitude: number) {
        if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            return;
        }
        if (this.inertiaEnabled && this.m_zoomIsAnimated) {
            this.stopZoom();
        }

        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        const currentAzimuthAltitude = utils.directionToAzimuthAltitude(
            this.m_currentViewDirection
        );

        const topElevation =
            (1.0 / Math.sin(currentAzimuthAltitude.altitude)) * this.mapView.camera.position.z;
        const focusPointInWorldPosition = MapViewUtils.rayCastWorldCoordinates(this.mapView, 0, 0);

        const deltaAltitudeConstrained = this.getMinDelta(deltaAltitude);

        this.rotate(deltaAzimuth, deltaAltitudeConstrained);

        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        const newAzimuthAltitude = utils.directionToAzimuthAltitude(this.m_currentViewDirection);

        const newElevation = Math.sin(newAzimuthAltitude.altitude) * topElevation;
        this.mapView.camera.position.z = newElevation;
        const newFocusPointInWorldPosition = MapViewUtils.rayCastWorldCoordinates(
            this.mapView,
            0,
            0
        );

        if (!focusPointInWorldPosition || !newFocusPointInWorldPosition) {
            // We do this to trigger an update in all cases.
            this.updateMapView();
            return;
        }

        const diff = focusPointInWorldPosition.sub(newFocusPointInWorldPosition);
        MapViewUtils.panCameraAboveFlatMap(this.mapView, diff.x, diff.y);
    }

    /**
     * Moves the camera along the view direction in meters.
     * A positive value will move the camera further away from the point where the camera looks at.
     * A negative value will move the camera near to the point where the camera looks at.
     *
     * @param amount Amount to move along the view direction in meters.
     */
    moveAlongTheViewDirection(amount: number) {
        this.mapView.camera.getWorldDirection(this.m_currentViewDirection);
        this.m_currentViewDirection.multiplyScalar(amount);
        this.mapView.camera.position.z += this.m_currentViewDirection.z;
        this.updateMapView();
        this.mapView.addEventListener(
            MapViewEventNames.AfterRender,
            this.assignZoomAfterTouchZoomRender
        );
    }

    /**
     * Sets the rotation of the camera according to yaw and pitch in degrees.
     *
     * **Note:** `yaw == 0 && pitch == 0` will north up the map and you will look downwards onto the
     * map.
     *
     * @param yaw Yaw in degrees.
     * @param pitch Pitch in degrees.
     */
    setRotation(yaw: number, pitch: number): void {
        MapViewUtils.setRotation(this.mapView, yaw, pitch);
    }

    /**
     * Zooms and moves the map in such a way that the given target position remains at the same
     * position after the zoom.
     *
     * @param targetPositionOnScreenXinNDC Target x position in NDC space.
     * @param targetPositionOnScreenYinNDC Target y position in NDC space.
     */
    zoomOnTargetPosition(
        targetPositionOnScreenXinNDC: number,
        targetPositionOnScreenYinNDC: number,
        zoomLevel: number
    ) {
        MapViewUtils.zoomOnTargetPosition(
            this.mapView,
            targetPositionOnScreenXinNDC,
            targetPositionOnScreenYinNDC,
            zoomLevel
        );
    }

    /**
     * Zooms to the desired location by the provided value.
     *
     * @param zoomLevel Zoom level.
     * @param screenTarget Zoom target on screen.
     */
    setZoomLevel(
        zoomLevel: number,
        screenTarget: { x: number; y: number } | THREE.Vector2 = { x: 0, y: 0 }
    ) {
        if (this.enabled === false) {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        // Register the zoom request
        this.m_startZoom = this.currentZoom;
        this.m_zoomDeltaRequested = zoomLevel - this.zoomLevelTargeted;

        // Cancel panning so the point of origin of the zoom is maintained.
        this.stopPan();

        // Assign the new animation start time.
        this.m_zoomAnimationStartTime = performance.now();

        this.m_zoomTargetNormalizedCoordinates.set(screenTarget.x, screenTarget.y);

        this.handleZoom();

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
    }

    /**
     * Toggles the camera pitch between 0 (looking down) and the value at `this.tiltAngle`.
     */
    toggleTilt(): void {
        this.m_startPitch = this.currentPitch;
        const aimTilt = this.m_startPitch < EPSILON || this.m_tiltState === TiltState.Down;
        this.m_pitchRequested = aimTilt ? this.tiltAngle : 0;
        this.m_tiltState = aimTilt ? TiltState.Tilted : TiltState.Down;
        this.m_tiltAnimationStartTime = performance.now();
        this.tilt();
    }

    /**
     * Set the camera height.
     */
    set cameraHeight(height: number) {
        //Set the cameras height according to the given zoom level.
        this.camera.position.setZ(height);
        this.camera.matrixWorldNeedsUpdate = true;
    }

    /**
     * Get the current camera height.
     */
    get cameraHeight(): number {
        // ### Sync with the way geoviz is computing the zoom level.
        return this.mapView.camera.position.z;
    }

    /**
     * Set camera max pitch angle.
     *
     * @param angle Angle in degrees.
     */
    set maxPitchAngle(angle: number) {
        this.m_maxPitchAngle = THREE.Math.degToRad(angle);
    }

    /**
     * Get the camera max pitch angle in degrees.
     */
    get maxPitchAngle(): number {
        return THREE.Math.radToDeg(this.m_maxPitchAngle);
    }

    /**
     * Set camera min pitch angle.
     *
     * @param angle Angle in degrees.
     */
    set minPitchAngle(angle: number) {
        this.m_minPitchAngle = THREE.Math.degToRad(angle);
    }

    /**
     * Get the camera min pitch angle in degrees.
     */
    get minPitchAngle(): number {
        return THREE.Math.radToDeg(this.m_minPitchAngle);
    }

    /**
     * Get the zoom level targeted by `MapControls`. Useful when inertia is on, to add incremented
     * values to the target instead of getting the random zoomLevel value during the interpolation.
     */
    get zoomLevelTargeted(): number {
        return this.m_targetedZoom === undefined ? this.currentZoom : this.m_targetedZoom;
    }

    /**
     * Handy getter to know if the view is in the process of looking down or not.
     */
    get tiltState(): TiltState {
        if (this.m_tiltState === undefined) {
            this.m_tiltState =
                this.currentPitch < EPSILON || this.m_tiltState === TiltState.Down
                    ? TiltState.Tilted
                    : TiltState.Down;
        }
        return this.m_tiltState;
    }

    private set currentZoom(zoom: number) {
        this.m_currentZoom = zoom;
    }

    private get currentZoom(): number {
        return this.m_currentZoom !== undefined ? this.m_currentZoom : this.mapView.zoomLevel;
    }

    private set currentPitch(pitch: number) {
        this.m_currentPitch = pitch;
    }

    private get currentPitch(): number {
        return MapViewUtils.extractYawPitchRoll(
            this.camera.quaternion,
            this.mapView.projection.type
        ).pitch;
    }

    private get targetedPitch(): number {
        return this.m_targetedPitch === undefined
            ? this.m_currentPitch === undefined
                ? this.currentPitch
                : this.m_currentPitch
            : this.m_targetedPitch;
    }

    private assignZoomAfterTouchZoomRender() {
        this.m_currentZoom = this.mapView.zoomLevel;
        this.mapView.removeEventListener(
            MapViewEventNames.AfterRender,
            this.assignZoomAfterTouchZoomRender
        );
    }

    private tilt() {
        if (this.m_pitchRequested !== undefined) {
            this.m_targetedPitch = Math.max(
                Math.min(this.m_pitchRequested, this.maxPitchAngle),
                this.m_minPitchAngle
            );
            this.m_pitchRequested = undefined;
        }

        if (this.inertiaEnabled) {
            if (!this.m_tiltIsAnimated) {
                this.m_tiltIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.tilt);
            }
            const currentTime = performance.now();
            this.m_tiltAnimationTime = (currentTime - this.m_tiltAnimationStartTime) / 1000;
            const tiltFinished = this.m_tiltAnimationTime > this.tiltToggleDuration;
            if (tiltFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_tiltAnimationTime = this.tiltToggleDuration;
                    this.stopTilt();
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }

        this.m_currentPitch = this.inertiaEnabled
            ? this.easeOutCubic(
                  this.m_startPitch,
                  this.targetedPitch,
                  Math.min(1, this.m_tiltAnimationTime / this.tiltToggleDuration)
              )
            : this.targetedPitch;

        const initialPitch = this.currentPitch;
        const deltaAngle = this.m_currentPitch - initialPitch;
        const oldCameraDistance = this.mapView.camera.position.z / Math.cos(initialPitch);
        const newHeight = Math.cos(this.currentPitch) * oldCameraDistance;

        this.orbitFocusPoint(newHeight - this.camera.position.z, THREE.Math.radToDeg(deltaAngle));

        this.updateMapView();
    }

    private stopTilt() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.tilt);
        this.m_tiltIsAnimated = false;
        this.m_targetedPitch = this.m_currentPitch = undefined;
    }

    private easeOutCubic(startValue: number, endValue: number, time: number): number {
        return startValue + (endValue - startValue) * (--time * time * time + 1);
    }

    private handleZoom() {
        if (this.m_zoomDeltaRequested !== 0) {
            this.m_targetedZoom = Math.max(
                Math.min(this.zoomLevelTargeted + this.m_zoomDeltaRequested, this.maxZoomLevel),
                this.minZoomLevel
            );
            this.m_zoomDeltaRequested = 0;
        }
        if (this.inertiaEnabled && this.zoomInertiaDampingDuration > 0) {
            if (!this.m_zoomIsAnimated) {
                this.m_zoomIsAnimated = true;
                this.mapView.addEventListener(MapViewEventNames.AfterRender, this.handleZoom);
            }
            const currentTime = performance.now();
            this.m_zoomAnimationTime = (currentTime - this.m_zoomAnimationStartTime) / 1000;
            const zoomFinished = this.m_zoomAnimationTime > this.zoomInertiaDampingDuration;
            if (zoomFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_zoomAnimationTime = this.zoomInertiaDampingDuration;
                    this.stopZoom();
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }
        }

        this.currentZoom =
            !this.inertiaEnabled || Math.abs(this.zoomLevelTargeted - this.m_startZoom) < EPSILON
                ? this.zoomLevelTargeted
                : this.easeOutCubic(
                      this.m_startZoom,
                      this.zoomLevelTargeted,
                      Math.min(1, this.m_zoomAnimationTime / this.zoomInertiaDampingDuration)
                  );

        MapViewUtils.zoomOnTargetPosition(
            this.mapView,
            this.m_zoomTargetNormalizedCoordinates.x,
            this.m_zoomTargetNormalizedCoordinates.y,
            this.currentZoom
        );

        this.updateMapView();
    }

    private stopZoom() {
        this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.handleZoom);
        this.m_zoomIsAnimated = false;
    }

    /**
     * Method to flip crêpes.
     */
    private handlePan() {
        if (this.m_state === State.NONE && this.m_lastAveragedPanDistanceOrAngle === 0) {
            return;
        }

        if (this.inertiaEnabled && !this.m_panIsAnimated) {
            this.m_panIsAnimated = true;
            this.mapView.addEventListener(MapViewEventNames.AfterRender, this.handlePan);
        }

        const applyInertia =
            this.inertiaEnabled &&
            this.panInertiaDampingDuration > 0 &&
            this.m_state === State.NONE &&
            this.m_lastAveragedPanDistanceOrAngle > 0;

        if (applyInertia) {
            const currentTime = performance.now();
            this.m_panAnimationTime = (currentTime - this.m_panAnimationStartTime) / 1000;
            const panFinished = this.m_panAnimationTime > this.panInertiaDampingDuration;

            if (panFinished) {
                if (this.m_needsRenderLastFrame) {
                    this.m_needsRenderLastFrame = false;
                    this.m_panAnimationTime = this.panInertiaDampingDuration;
                    this.mapView.removeEventListener(MapViewEventNames.AfterRender, this.handlePan);
                    this.m_panIsAnimated = false;
                }
            } else {
                this.m_needsRenderLastFrame = true;
            }

            const animationTime = this.m_panAnimationTime / this.panInertiaDampingDuration;
            this.m_currentInertialPanningSpeed = this.easeOutCubic(
                this.m_lastAveragedPanDistanceOrAngle,
                0,
                Math.min(1, animationTime)
            );
            if (this.m_currentInertialPanningSpeed === 0) {
                this.m_lastAveragedPanDistanceOrAngle = 0;
            }
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                this.m_panDistanceFrameDelta
                    .copy(this.m_lastPanVector)
                    .setLength(this.m_currentInertialPanningSpeed);
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                this.m_rotateGlobeQuaternion
                    .setFromAxisAngle(
                        this.m_lastRotateGlobeAxis,
                        this.m_currentInertialPanningSpeed
                    )
                    .normalize();
            }
        } else {
            let panDistanceOrAngle: number = 0;
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                panDistanceOrAngle = this.m_lastPanVector
                    .copy(this.m_panDistanceFrameDelta)
                    .length();
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                panDistanceOrAngle = this.m_lastRotateGlobeAngle;
                this.m_rotateGlobeQuaternion.setFromAxisAngle(
                    this.m_lastRotateGlobeAxis,
                    this.m_lastRotateGlobeAngle
                );
                this.m_rotateGlobeQuaternion.normalize();
            }
            this.m_currentPanDistanceOrAngleIndex =
                (this.m_currentPanDistanceOrAngleIndex + 1) % USER_INPUTS_TO_CONSIDER;
            this.m_recentPanDistancesOrAngles[
                this.m_currentPanDistanceOrAngleIndex
            ] = panDistanceOrAngle;
            this.m_lastAveragedPanDistanceOrAngle =
                this.m_recentPanDistancesOrAngles.reduce((a, b) => a + b) / USER_INPUTS_TO_CONSIDER;
        }

        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            MapViewUtils.panCameraAboveFlatMap(
                this.mapView,
                this.m_panDistanceFrameDelta.x,
                this.m_panDistanceFrameDelta.y
            );
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            MapViewUtils.rotateCameraAroundGlobe(
                this.mapView,
                this.m_lastRotateGlobeFromVector,
                this.m_tmpVector3
                    .copy(this.m_lastRotateGlobeFromVector)
                    .applyQuaternion(this.m_rotateGlobeQuaternion)
            );
        }
        if (!applyInertia) {
            this.m_panDistanceFrameDelta.set(0, 0, 0);
            this.m_lastRotateGlobeAngle = 0;
        }

        this.updateMapView();
    }

    private stopPan() {
        this.m_panDistanceFrameDelta.set(0, 0, 0);
        this.m_lastAveragedPanDistanceOrAngle = 0;
    }

    private bindInputEvents(domElement: HTMLCanvasElement) {
        const onContextMenu = this.contextMenu.bind(this);
        const onMouseDown = this.mouseDown.bind(this);
        const onMouseWheel = this.mouseWheel.bind(this);
        const onTouchStart = this.touchStart.bind(this);
        const onTouchEnd = this.touchEnd.bind(this);
        const onTouchMove = this.touchMove.bind(this);
        const onMouseDoubleClick = this.mouseDoubleClick.bind(this);

        domElement.addEventListener("dblclick", onMouseDoubleClick, false);
        domElement.addEventListener("contextmenu", onContextMenu, false);
        domElement.addEventListener("mousedown", onMouseDown, false);
        domElement.addEventListener("wheel", onMouseWheel, false);
        domElement.addEventListener("touchstart", onTouchStart, false);
        domElement.addEventListener("touchend", onTouchEnd, false);
        domElement.addEventListener("touchmove", onTouchMove, false);

        this.dispose = () => {
            domElement.removeEventListener("dblclick", onMouseDoubleClick, false);
            domElement.removeEventListener("contextmenu", onContextMenu, false);
            domElement.removeEventListener("mousedown", onMouseDown, false);
            domElement.removeEventListener("wheel", onMouseWheel, false);
            domElement.removeEventListener("touchstart", onTouchStart, false);
            domElement.removeEventListener("touchend", onTouchEnd, false);
            domElement.removeEventListener("touchmove", onTouchMove, false);
        };
    }

    private updateMapView() {
        this.dispatchEvent(MAPCONTROL_EVENT);
        this.mapView.update();
    }

    private mouseDoubleClick(e: MouseEvent) {
        if (this.enabled === false) {
            return;
        }
        this.zoomOnDoubleClickOrTap(e.clientX, e.clientY);
    }

    private mouseDown(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        if (event.shiftKey || event.ctrlKey) {
            return;
        }

        event.stopPropagation();

        if (this.m_state !== State.NONE) {
            return;
        }

        if (event.button === 0) {
            this.m_state = State.PAN;
        } else if (event.button === 1) {
            this.m_state = State.ROTATE;
        } else if (event.button === 2 && this.tiltEnabled) {
            this.m_state = State.ORBIT;
        } else {
            return;
        }

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);

        this.m_lastMousePosition.setX(event.clientX);
        this.m_lastMousePosition.setY(event.clientY);

        const onMouseMove = this.mouseMove.bind(this);
        const onMouseUp = this.mouseUp.bind(this);

        window.addEventListener("mousemove", onMouseMove, false);
        window.addEventListener("mouseup", onMouseUp, false);

        this.m_cleanupMouseEventListeners = () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }

    private mouseMove(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_mouseDelta.set(
            event.clientX - this.m_lastMousePosition.x,
            event.clientY - this.m_lastMousePosition.y
        );

        if (this.m_state === State.PAN) {
            const vectors = this.getWorldPositionWithElevation(
                this.m_lastMousePosition.x,
                this.m_lastMousePosition.y,
                event.clientX,
                event.clientY
            );
            if (vectors === undefined) {
                return;
            }
            const { fromWorld, toWorld } = vectors;
            this.panFromTo(fromWorld, toWorld);
        } else if (this.m_state === State.ROTATE) {
            this.rotate(
                -this.rotationMouseDeltaFactor * this.m_mouseDelta.x,
                this.rotationMouseDeltaFactor * this.m_mouseDelta.y
            );
        } else if (this.m_state === State.ORBIT) {
            this.orbitFocusPoint(
                this.orbitingMouseDeltaFactor * this.m_mouseDelta.x,
                -this.orbitingMouseDeltaFactor * this.m_mouseDelta.y
            );
        }

        this.m_lastMousePosition.set(event.clientX, event.clientY);
        this.m_zoomAnimationStartTime = performance.now();

        this.updateMapView();
        event.preventDefault();
        event.stopPropagation();
    }

    private mouseUp(event: MouseEvent) {
        if (this.enabled === false) {
            return;
        }

        this.updateMapView();

        event.preventDefault();
        event.stopPropagation();

        this.m_state = State.NONE;

        if (this.m_cleanupMouseEventListeners) {
            this.m_cleanupMouseEventListeners();
        }

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
    }

    private mouseWheel(event: WheelEvent) {
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
        const screenTarget = utils.calculateNormalizedDeviceCoordinates(
            event.offsetX,
            event.offsetY,
            width,
            height
        );

        this.setZoomLevel(
            this.zoomLevelTargeted + this.zoomLevelDeltaOnMouseWheel * (event.deltaY > 0 ? -1 : 1),
            screenTarget
        );

        event.preventDefault();
        event.stopPropagation();
    }

    /**
     * Calculates the angle of the vector, which is formed by two touch points in world space
     * against the X axis in world space on the map. The resulting angle is in radians and between
     * `-PI` and `PI`.
     */
    private calculateAngleFromTouchPointsInWorldspace(): number {
        if (this.m_touchState.touches.length < 2) {
            return 0;
        }

        const x =
            this.m_touchState.touches[1].currentWorldPosition.x -
            this.m_touchState.touches[0].currentWorldPosition.x;

        const y =
            this.m_touchState.touches[1].currentWorldPosition.y -
            this.m_touchState.touches[0].currentWorldPosition.y;

        return Math.atan2(y, x);
    }

    /**
     * Calculates the difference of the current distance of two touch points against their initial
     * distance in world space.
     */
    private calculatePinchDistanceInWorldSpace(): number {
        if (this.m_touchState.touches.length < 2) {
            return 0;
        }
        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            const previousDistance = this.m_tmpVector3
                .subVectors(
                    this.m_touchState.touches[0].initialWorldPosition,
                    this.m_touchState.touches[1].initialWorldPosition
                )
                .length();

            const currentDistance = this.m_tmpVector3
                .subVectors(
                    this.m_touchState.touches[0].currentWorldPosition,
                    this.m_touchState.touches[1].currentWorldPosition
                )
                .length();
            return currentDistance - previousDistance;
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            const previousDistance = this.m_tmpVector2
                .subVectors(
                    this.m_touchState.touches[0].lastTouchPoint,
                    this.m_touchState.touches[1].lastTouchPoint
                )
                .length();
            const currentDistance = this.m_tmpVector2
                .subVectors(
                    this.m_touchState.touches[0].currentTouchPoint,
                    this.m_touchState.touches[1].currentTouchPoint
                )
                .length();
            return currentDistance - previousDistance;
        }
        return 0;
    }

    private convertTouchPoint(touch: Touch, oldTouchState?: TouchState): TouchState | null {
        const newTouchPoint = new THREE.Vector2(touch.pageX, touch.pageY);

        if (oldTouchState !== undefined) {
            const oldTouchPoint = oldTouchState.currentTouchPoint;
            const vectors = this.getWorldPositionWithElevation(
                oldTouchPoint.x,
                oldTouchPoint.y,
                newTouchPoint.x,
                newTouchPoint.y
            );
            if (vectors === undefined) {
                return null;
            }
            const { toWorld } = vectors;
            return {
                currentTouchPoint: newTouchPoint,
                lastTouchPoint: newTouchPoint,
                currentWorldPosition: toWorld,
                initialWorldPosition: toWorld
            };
        } else {
            const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
            const to = utils.calculateNormalizedDeviceCoordinates(
                newTouchPoint.x,
                newTouchPoint.y,
                width,
                height
            );
            const toWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, to.x, to.y);
            if (toWorld === null) {
                return null;
            }
            return {
                currentTouchPoint: newTouchPoint,
                lastTouchPoint: newTouchPoint,
                currentWorldPosition: toWorld,
                initialWorldPosition: toWorld
            };
        }
    }

    private setTouchState(touches: TouchList) {
        this.m_touchState.touches = [];

        // TouchList doesn't conform to iterator interface so we cannot use 'for of'
        // tslint:disable-next-line:prefer-for-of
        for (let i = 0; i < touches.length; ++i) {
            const touchState = this.convertTouchPoint(touches[i]);
            if (touchState) {
                this.m_touchState.touches.push(touchState);
            }
        }

        if (this.m_touchState.touches.length !== 0) {
            this.updateTouchState();
            this.m_touchState.initialRotation = this.m_touchState.currentRotation;
        }
    }

    private updateTouchState() {
        this.m_touchState.currentRotation = this.calculateAngleFromTouchPointsInWorldspace();
    }

    private updateTouches(touches: TouchList) {
        const length = Math.min(touches.length, this.m_touchState.touches.length);
        for (let i = 0; i < length; ++i) {
            const oldTouchState = this.m_touchState.touches[i];
            const newTouchState = this.convertTouchPoint(touches[i], oldTouchState);
            if (newTouchState !== null) {
                newTouchState.initialWorldPosition = oldTouchState.initialWorldPosition;
                newTouchState.lastTouchPoint = oldTouchState.currentTouchPoint;
                this.m_touchState.touches[i] = newTouchState;
            }
        }
    }

    private zoomOnDoubleClickOrTap(x: number, y: number) {
        if (this.zoomLevelDeltaOnDoubleClick === 0) {
            return;
        }
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);
        const ndcCoords = utils.calculateNormalizedDeviceCoordinates(x, y, width, height);
        this.setZoomLevel(this.currentZoom + this.zoomLevelDeltaOnDoubleClick, ndcCoords);
    }

    private touchStart(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_tapStartTime = performance.now();
        this.m_fingerMoved = false;

        this.m_state = State.TOUCH;

        this.dispatchEvent(MAPCONTROL_EVENT_BEGIN_INTERACTION);
        this.setTouchState(event.touches);
        this.updateTouches(event.touches);

        event.preventDefault();
        event.stopPropagation();
    }

    private touchMove(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }

        this.m_fingerMoved = true;
        this.updateTouches(event.touches);
        this.updateTouchState();

        if (this.m_touchState.touches.length <= 2) {
            this.panFromTo(
                this.m_touchState.touches[0].initialWorldPosition,
                this.m_touchState.touches[0].currentWorldPosition
            );
        }

        if (this.m_touchState.touches.length === 2) {
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                const deltaRotation =
                    this.m_touchState.currentRotation - this.m_touchState.initialRotation;
                this.rotate(THREE.Math.radToDeg(deltaRotation));
                const pinchDistance = this.calculatePinchDistanceInWorldSpace();
                this.moveAlongTheViewDirection(pinchDistance);
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                // TODO: HARP-6597: Implement yaw rotation for globe, use `moveAlongViewDirection`
                // in both Planar and Spherical.
                const pinchDistance = this.calculatePinchDistanceInWorldSpace();
                this.setZoomLevel(this.currentZoom + pinchDistance * 0.01);
            }
        }

        // Tilting
        if (this.m_touchState.touches.length === 3 && this.tiltEnabled) {
            if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
                const firstTouch = this.m_touchState.touches[0];
                const diff = this.m_tmpVector2.subVectors(
                    firstTouch.currentTouchPoint,
                    firstTouch.lastTouchPoint
                );

                this.orbitFocusPoint(
                    this.orbitingTouchDeltaFactor * diff.x,
                    -this.orbitingTouchDeltaFactor * diff.y
                );
            } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
                // TODO: HARP-6023: Support tilting in globe.
            }
        }

        this.m_zoomAnimationStartTime = performance.now();

        this.updateMapView();
        event.preventDefault();
        event.stopPropagation();
    }

    private touchEnd(event: TouchEvent) {
        if (this.enabled === false) {
            return;
        }
        this.m_state = State.NONE;

        this.handleDoubleTap();

        this.setTouchState(event.touches);

        this.dispatchEvent(MAPCONTROL_EVENT_END_INTERACTION);
        this.updateMapView();

        event.preventDefault();
        event.stopPropagation();
    }

    private handleDoubleTap() {
        // Continue only if no touchmove happened.
        if (this.m_fingerMoved) {
            return;
        }

        const now = performance.now();
        const tapDuration = now - this.m_tapStartTime;

        // Continue only if proper tap.
        if (tapDuration > MAX_TAP_DURATION) {
            return;
        }

        // Continue only if this is the second valid tap.
        if (!this.m_isDoubleTap) {
            this.m_isDoubleTap = true;
            this.m_lastSingleTapTime = now;
            return;
        }

        // Continue only if the delay between the two taps is short enough.
        if (now - this.m_lastSingleTapTime > this.doubleTapTime * 1000) {
            // If too long, restart double tap validator too.
            this.m_isDoubleTap = false;
            return;
        }

        this.zoomOnDoubleClickOrTap(
            this.m_touchState.touches[0].currentTouchPoint.x,
            this.m_touchState.touches[0].currentTouchPoint.y
        );

        // Prevent a string of X valid taps and only consider pairs.
        this.m_isDoubleTap = false;
    }

    private contextMenu(event: Event) {
        event.preventDefault();
    }

    private getWorldPositionWithElevation(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number
    ): { fromWorld: THREE.Vector3; toWorld: THREE.Vector3 } | undefined {
        const { width, height } = utils.getWidthAndHeightFromCanvas(this.domElement);

        const from = utils.calculateNormalizedDeviceCoordinates(fromX, fromY, width, height);
        const to = utils.calculateNormalizedDeviceCoordinates(toX, toY, width, height);

        let toWorld: THREE.Vector3 | null;
        let fromWorld: THREE.Vector3 | null;

        let elevationProviderResult: THREE.Vector3 | undefined;

        if (this.mapView.elevationProvider !== undefined) {
            elevationProviderResult = this.mapView.elevationProvider.rayCast(fromX, fromY);
        }

        if (elevationProviderResult === undefined) {
            fromWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, from.x, from.y);
            toWorld = MapViewUtils.rayCastWorldCoordinates(this.mapView, to.x, to.y);
        } else {
            fromWorld = elevationProviderResult;
            const fromGeoAltitude = this.mapView.projection.unprojectAltitude(fromWorld);

            // We can ensure that points under the mouse stay there by projecting the to point onto
            // a plane with the altitude based on the initial point.
            toWorld = MapViewUtils.rayCastWorldCoordinates(
                this.mapView,
                to.x,
                to.y,
                fromGeoAltitude
            );
        }
        if (fromWorld === null || toWorld === null) {
            return;
        }
        return { fromWorld, toWorld };
    }

    private panFromTo(fromWorld: THREE.Vector3, toWorld: THREE.Vector3): void {
        // Cancel zoom inertia if a panning is triggered, so that the mouse location is kept.
        this.stopZoom();

        // Assign the new animation start time.
        this.m_panAnimationStartTime = performance.now();

        if (this.mapView.projection.type === geoUtils.ProjectionType.Planar) {
            this.m_panDistanceFrameDelta.subVectors(fromWorld, toWorld);
        } else if (this.mapView.projection.type === geoUtils.ProjectionType.Spherical) {
            this.m_lastRotateGlobeFromVector.copy(fromWorld);
            this.m_lastRotateGlobeAxis.crossVectors(fromWorld, toWorld).normalize();
            this.m_lastRotateGlobeAngle = fromWorld.angleTo(toWorld);
            // When fromWorld and toWorld are too close, there is a risk of getting an NaN
            // value. The following ensures that the controls don't break.
            if (isNaN(this.m_lastRotateGlobeAngle)) {
                this.m_lastRotateGlobeAngle = 0;
            }
        }

        this.handlePan();
    }

    private constrainPitchAngle(pitchAngle: number, deltaPitch: number): number {
        const tmpPitchAngle = THREE.Math.clamp(
            pitchAngle + deltaPitch,
            this.m_minPitchAngle,
            this.m_maxPitchAngle
        );
        if (
            this.tiltEnabled &&
            tmpPitchAngle <= this.m_maxPitchAngle &&
            tmpPitchAngle >= this.m_minPitchAngle
        ) {
            pitchAngle = tmpPitchAngle;
        }
        return pitchAngle;
    }

    /**
     * This method approximates the minimum delta altitude by attempts. It has been preferred over a
     * solution where the minimum delta is calculated adding the new delta to the current delta,
     * because that solution would not have worked with terrains.
     */
    private getMinDelta(deltaAltitude: number): number {
        // Do not even start to calculate a delta if the camera is already under the minimum height.
        if (this.mapView.camera.position.z < this.minCameraHeight && deltaAltitude > 0) {
            return 0;
        }

        const checkMinCamHeight = (deltaAlt: number, camera: THREE.PerspectiveCamera) => {
            const cameraPos = camera.position;
            const cameraQuat = camera.quaternion;
            const newPitchQuaternion = new THREE.Quaternion();
            const viewDirection = new THREE.Vector3();
            const mockCamera = new THREE.Object3D();
            mockCamera.position.set(cameraPos.x, cameraPos.y, cameraPos.z);
            mockCamera.quaternion.set(cameraQuat.x, cameraQuat.y, cameraQuat.z, cameraQuat.w);

            // save the current direction of the camera in viewDirection
            mockCamera.getWorldDirection(viewDirection);

            //calculate the new azimuth and altitude
            const currentAzimuthAltitude = utils.directionToAzimuthAltitude(viewDirection);
            const topElevation =
                (1.0 / Math.sin(currentAzimuthAltitude.altitude)) * mockCamera.position.z;

            // get the current quaternion from the camera
            const yawPitchRoll = MapViewUtils.extractYawPitchRoll(
                this.camera.quaternion,
                this.mapView.projection.type
            );

            //calculate the pitch
            const deltaPitchRadians = THREE.Math.degToRad(deltaAlt);
            const pitchAngle = this.constrainPitchAngle(yawPitchRoll.pitch, deltaPitchRadians);
            newPitchQuaternion.setFromAxisAngle(pitchAxis, pitchAngle);

            // update the camera and the viewDirection vector
            mockCamera.quaternion.copy(newPitchQuaternion);
            mockCamera.matrixWorldNeedsUpdate = true;
            mockCamera.getWorldDirection(viewDirection);

            // use the viewDirection to get the height
            const newAzimuthAltitude = utils.directionToAzimuthAltitude(viewDirection);
            const newElevation = Math.sin(newAzimuthAltitude.altitude) * topElevation;
            return newElevation;
        };

        let constrainedDeltaAltitude = deltaAltitude;
        for (let i = 0; i < MAX_DELTA_ALTITUDE_STEPS; i++) {
            const cameraHeight = checkMinCamHeight(constrainedDeltaAltitude, this.mapView.camera);
            if (cameraHeight < this.minCameraHeight) {
                constrainedDeltaAltitude *= 0.5;
            } else {
                return constrainedDeltaAltitude;
            }
        }
        return constrainedDeltaAltitude;
    }
}
