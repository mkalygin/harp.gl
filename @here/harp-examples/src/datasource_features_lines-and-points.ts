/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { StyleSet } from "@here/harp-datasource-protocol";
import {
    FeaturesDataSource,
    MapViewFeature,
    MapViewLineFeature,
    MapViewMultiPointFeature
} from "@here/harp-features-datasource";
import { GeoCoordinates } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightInfo, MapView } from "@here/harp-mapview";
import { APIFormat, OmvDataSource } from "@here/harp-omv-datasource";
import { accessToken } from "../config";
import { faults, hotspots } from "../resources/geology";

/**
 * This example illustrates how to add user lines and points in [[MapView]]. As custom features,
 * they are handled through a [[FeaturesDataSource]].
 *
 * First we create a base map. For more details, check the `hello` example.
 * ```typescript
 * [[include:harp_demo_features_linespoints_0.ts]]
 * ```
 *
 * Then we generate all the [[MapViewLineFeature]]s, with the desired text string to use for the
 * text style, straight from the data:
 * ```typescript
 * [[include:harp_demo_features_linespoints_1.ts]]
 * ```
 *
 * We also add the hotspots in the earth's mantle as a [[MapViewMultiPointFeature]].
 * ```typescript
 * [[include:harp_demo_features_linespoints_2.ts]]
 * ```
 *
 * Then we use the general [[DataSource]] mechanism: the [[FeaturesDataSource]] is created, added
 * to [[MapView]], the [[MapViewFeature]]s are added to it, and we apply the [[StyleSet]] we desire:
 * ```typescript
 * [[include:harp_demo_features_linespoints_3.ts]]
 * ```
 *
 * Note how the [[StyleSet]] of this example creates the text paths out of the line features. Also,
 * we duplicate the line styles, one being a dashed line and the other a solid line, to have this
 * specific look for the ridges and trenches. The point style is also duplicated, so that a bigger
 * point is rendered below the first one, and creates an outline effect.
 */
export namespace LinesPointsFeaturesExample {
    // snippet:harp_demo_features_linespoints_0.ts
    const map = createBaseMap();
    // end:harp_demo_features_linespoints_0.ts

    // snippet:harp_demo_features_linespoints_3.ts
    const featuresDataSource = new FeaturesDataSource();
    map.addDataSource(featuresDataSource).then(() => {
        const features = getFeatures(faults);
        const styleSet = getStyleSet();
        featuresDataSource.add(...features).setStyleSet(styleSet);
    });
    // end:harp_demo_features_linespoints_3.ts

    function getFeatures(features: {
        [key: string]: { [key: string]: number[][] };
    }): MapViewFeature[] {
        const featuresList: MapViewFeature[] = [];
        for (const type of Object.keys(features)) {
            for (const featureName of Object.keys(features[type])) {
                const name = featureName.indexOf("unknown") === -1 ? featureName : undefined;
                // snippet:harp_demo_features_linespoints_1.ts
                const feature = new MapViewLineFeature(features[type][featureName], { name, type });
                // end:harp_demo_features_linespoints_1.ts
                featuresList.push(feature);
            }
        }
        // snippet:harp_demo_features_linespoints_1.ts
        const hotspotsFeature = new MapViewMultiPointFeature(hotspots);
        // end:harp_demo_features_linespoints_1.ts
        featuresList.push(hotspotsFeature);
        return featuresList;
    }

    function getStyleSet(): StyleSet {
        return [
            {
                when: "$geometryType == 'line' && type == 'ridges'",
                technique: "dashed-line",
                renderOrder: 10003,
                attr: {
                    color: "#fc3",
                    lineWidth: 15,
                    metricUnit: "Pixel",
                    gapSize: 15,
                    dashSize: 1
                }
            },
            {
                when: "$geometryType == 'line' && type == 'ridges'",
                technique: "solid-line",
                renderOrder: 10003,
                attr: {
                    color: "#fc3",
                    lineWidth: 1,
                    metricUnit: "Pixel"
                }
            },
            {
                when: "$geometryType == 'line' && type == 'trenches'",
                technique: "dashed-line",
                renderOrder: 10002,
                attr: {
                    color: "#09f",
                    lineWidth: 10,
                    metricUnit: "Pixel",
                    gapSize: 10,
                    dashSize: 1
                }
            },
            {
                when: "$geometryType == 'line' && type == 'trenches'",
                technique: "solid-line",
                renderOrder: 10002,
                attr: {
                    color: "#09f",
                    lineWidth: 1,
                    metricUnit: "Pixel"
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10001,
                attr: {
                    color: "#ca6",
                    size: 6
                }
            },
            {
                when: "$geometryType == 'point'",
                technique: "circles",
                renderOrder: 10000,
                attr: {
                    color: "#a83",
                    size: 8
                }
            },
            {
                when: "$geometryType == 'line'",
                technique: "text",
                attr: {
                    color: "#333",
                    size: 15
                }
            }
        ];
    }

    function createBaseMap(): MapView {
        document.body.innerHTML += getExampleHTML();

        const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme: "resources/berlin_tilezen_day_reduced.json"
        });
        mapView.setCameraGeolocationAndZoom(new GeoCoordinates(10, -150), 2.6);

        const controls = new MapControls(mapView);
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));

        const hereCopyrightInfo: CopyrightInfo = {
            id: "here.com",
            year: new Date().getFullYear(),
            label: "HERE",
            link: "https://legal.here.com/terms"
        };
        const copyrights: CopyrightInfo[] = [hereCopyrightInfo];

        const baseMap = new OmvDataSource({
            baseUrl: "https://xyz.api.here.com/tiles/herebase.02",
            apiFormat: APIFormat.XYZOMV,
            styleSetName: "tilezen",
            maxZoomLevel: 17,
            authenticationCode: accessToken,
            copyrightInfo: copyrights
        });
        mapView.addDataSource(baseMap);

        return mapView;
    }

    function getExampleHTML() {
        return (
            `
            <style>
                #mapCanvas {
                    top: 0;
                }
                #info{
                    color: #fff;
                    width: 80%;
                    text-align: center;
                    font-family: monospace;
                    left: 50%;
                    position: relative;
                    margin: 10px 0 0 -40%;
                    font-size: 15px;
                }
                #caption-bg{
                    display: inline-block;
                    background: rgba(255,255,255,0.8);
                    border-radius: 4px;
                    max-width:calc(100% - 150px);
                    margin: 0 10px;
                }
                #caption{
                    width: 100%;
                    position: absolute;
                    bottom: 25px;
                    text-align:center;
                    font-family: Arial;
                    color:#222;
                }
                h1{
                    font-size:15px;
                    text-transform: uppercase;
                    padding: 5px 15px;
                    display: inline-block;
                }
                @media screen and (max-width: 700px) {
                    #info{
                        font-size:11px;
                    }
                    h1{
                        padding:0px;
                        margin:5px
                    }
                }
                </style>
                <p id=info>This example demonstrates user points, lines and text paths. The text ` +
            `string is taken from the "name" property defined in the custom features. The style ` +
            `of the lines is property-based.</p>
                <div id=caption>
                    <div id=caption-bg>
                        <h1>Hotspots on Earth's mantle, with main ridges and trenches.</h1>
                    </div>
                </div>
        `
        );
    }
}
