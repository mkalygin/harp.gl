/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeoCoordinatesLike } from "./GeoCoordinatesLike";

import * as THREE from "three";

/**
 * `GeoCoordinates` is used to represent geo positions.
 */
export class GeoCoordinates implements GeoCoordinatesLike {
    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in degrees.
     * @param longitude Longitude in degrees.
     * @param altitude Altitude in meters.
     */
    static fromDegrees(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(latitude, longitude, altitude);
    }

    /**
     * Returns a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in radians.
     * @param longitude Longitude in radians.
     * @param altitude Altitude in meters.
     */
    static fromRadians(latitude: number, longitude: number, altitude?: number): GeoCoordinates {
        return new GeoCoordinates(
            THREE.Math.radToDeg(latitude),
            THREE.Math.radToDeg(longitude),
            altitude
        );
    }

    /**
     * Creates a `GeoCoordinates` from the given latitude, longitude, and optional altitude.
     *
     * @param latitude Latitude in degrees.
     * @param longitude Longitude in degrees.
     * @param altitude Altitude in meters.
     */
    constructor(public latitude: number, public longitude: number, public altitude?: number) {}

    /**
     * Returns the latitude in radians.
     */
    get latitudeInRadians(): number {
        return THREE.Math.degToRad(this.latitude);
    }

    /**
     * Returns the longitude in radians.
     */
    get longitudeInRadians(): number {
        return THREE.Math.degToRad(this.longitude);
    }

    /**
     * Returns the latitude in degrees.
     * @deprecated Use the [[latitude]] property instead.
     */
    get latitudeInDegrees(): number {
        return this.latitude;
    } // compat api

    /**
     * Returns the longitude in degrees.
     * @deprecated Use the [[longitude]] property instead.
     */
    get longitudeInDegrees(): number {
        return this.longitude;
    } // compat api

    /**
     * Returns `true` if this `GeoCoordinates` is valid; returns `false` otherwise.
     */
    isValid(): boolean {
        return !isNaN(this.latitude) && !isNaN(this.longitude);
    }

    /**
     * Returns the normalized `GeoCoordinates`.
     */
    normalized(): GeoCoordinates {
        let { latitude, longitude } = this;

        if (isNaN(latitude) || isNaN(longitude)) {
            return this;
        }

        if (latitude > 90) {
            let wrapped = (latitude + 90) % 360;
            if (wrapped >= 180) {
                longitude += 180;
                wrapped = 360 - wrapped;
            }

            latitude = wrapped - 90;
        }

        if (latitude < -90) {
            let wrapped = (latitude - 90) % 360;
            if (wrapped <= -180) {
                longitude += 180;
                wrapped = -360 - wrapped;
            }

            latitude = wrapped + 90;
        }

        if (longitude < -180 || longitude > 180) {
            const sign = Math.sign(longitude);
            longitude = (((longitude % 360) + 180 * sign) % 360) - 180 * sign;
        }

        if (latitude === this.latitude && longitude === this.longitude) {
            return this;
        }

        return new GeoCoordinates(latitude, longitude, this.altitude);
    }

    /**
     * Returns `true` if this `GeoCoordinates` is equal to the other.
     *
     * @param other GeoCoordinatesLike to compare to.
     */
    equals(other: GeoCoordinatesLike): boolean {
        return (
            this.latitude === other.latitude &&
            this.longitude === other.longitude &&
            this.altitude === other.altitude
        );
    }

    /**
     * Copy values from the other.
     *
     * @param other GeoCoordinatesLike to copy all values from.
     */
    copy(other: GeoCoordinatesLike): GeoCoordinates {
        this.latitude = other.latitude;
        this.longitude = other.longitude;
        this.altitude = other.altitude;
        return this;
    }

    /**
     * Clones this `GeoCoordinates`.
     * @deprecated
     */
    clone(): GeoCoordinates {
        return new GeoCoordinates(this.latitude, this.longitude, this.altitude);
    }
}
