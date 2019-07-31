/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";

export namespace SynchronousRendering {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    const mapView = new MapView({
        canvas,
        theme: "resources/berlin_tilezen_base.json",
        synchronousRendering: true
    });
    mapView.resize(window.innerWidth, window.innerHeight);
    window.addEventListener("resize", () => {
        mapView.resize(window.innerWidth, window.innerHeight);
    });

    const omvDataSource = new OmvDataSource({
        baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
        apiFormat: APIFormat.XYZOMV,
        styleSetName: "tilezen",
        authenticationCode: accessToken
    });
    mapView.addDataSource(omvDataSource);

    const currentState = {
        latitude: 40.707,
        longitude: -74.01,
        altitude: 0,
        zoom: 16,
        yaw: 0,
        pitch: 30
    };

    function update() {
        requestAnimationFrame(update);
        currentState.yaw += 0.1;
        currentState.pitch = 45 + Math.cos(currentState.yaw / 10) * 10;
        draw();
    }

    function draw() {
        const { latitude, longitude, altitude, zoom, yaw, pitch } = currentState;
        mapView.setCameraGeolocationAndZoom(
            new GeoCoordinates(latitude, longitude, altitude),
            zoom,
            yaw,
            pitch
        );
        mapView.renderSync();
    }

    update();
}
