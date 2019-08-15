/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:no-unused-expression
//    expect-type assertions are unused expressions and are perfectly valid

// tslint:disable:no-empty
//    lots of stubs are needed which are just placeholders and are empty

// tslint:disable:only-arrow-functions
//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import {
    DecodedTile,
    ExtendedTileInfo,
    Geometry,
    GeometryType
} from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { GeoCoordinates, TileKey } from "@here/harp-geoutils";
import { MapView, MapViewEventNames, ThemeLoader, TileLoaderState } from "@here/harp-mapview";
import { GeoJsonTiler } from "@here/harp-mapview-decoder/lib/GeoJsonTiler";
import { waitForEvent } from "@here/harp-test-utils/";
import { loadTestResource } from "@here/harp-test-utils/lib/TestDataUtils";
import * as TestUtils from "@here/harp-test-utils/lib/WebGLStub";
import { FontCatalog } from "@here/harp-text-canvas";
import { GlyphTextureCache } from "@here/harp-text-canvas/lib/rendering/GlyphTextureCache";
import { assert } from "chai";
import * as sinon from "sinon";
import * as THREE from "three";
import { OmvTileDecoder } from "../index-worker";
import { OmvDataSource } from "../lib/OmvDataSource";
import { OmvTile } from "../lib/OmvTile";
import { GEOJSON_DATA, THEME } from "./resources/geoJsonData";

declare const global: any;

// repeat a guard function until guard return true or repeat count <= 0
async function repeatUntil(fn: () => boolean, interval = 5, repeat = 20) {
    if (fn() === true) {
        return;
    }

    return new Promise(resolve => {
        const id = setInterval(() => {
            if (repeat <= 0) {
                clearInterval(id);
            }
            repeat--;
            if (fn() === true) {
                clearInterval(id);
                resolve();
            }
        }, interval);
    });
}

// sets the given point in the middle of the screen
async function displayLocation(mapView: MapView, location: GeoCoordinates) {
    mapView.setCameraGeolocationAndZoom(location, 2);
    await waitForEvent(mapView, MapViewEventNames.CameraPositionChanged);

    await repeatUntil(() => {
        return mapView.visibleTileSet.allVisibleTilesLoaded;
    });
}

describe("MapView Picking", async function() {
    const inNodeContext = typeof window === "undefined";
    const tileKey = new TileKey(0, 0, 0);

    let sandbox: sinon.SinonSandbox;
    let clearColorStub: sinon.SinonStub;
    let addEventListenerSpy: sinon.SinonStub;
    let removeEventListenerSpy: sinon.SinonStub;
    let canvas: HTMLCanvasElement;
    let mapView: MapView;
    let geoJsonDataSource: OmvDataSource;

    beforeEach(async function() {
        sandbox = sinon.createSandbox();
        clearColorStub = sandbox.stub();
        sandbox
            .stub(THREE, "WebGLRenderer")
            .returns(TestUtils.getWebGLRendererStub(sandbox, clearColorStub));

        sandbox.stub(GlyphTextureCache.prototype as any, "update").callsFake(() => {});

        // load font data
        sandbox.stub(FontCatalog as any, "loadJSON").callsFake((url: URL) => {
            let urlStr = url.toString();

            if (urlStr.includes("fonts/Default_FontCatalog.json")) {
                return loadTestResource(
                    "@here/harp-fontcatalog",
                    "resources/Default_FontCatalog.json",
                    "json"
                );
            }
            const fontsDir = "/fonts";
            urlStr = urlStr.slice(urlStr.indexOf(fontsDir) + fontsDir.length);
            return loadTestResource("@here/harp-fontcatalog", "resources/" + urlStr, "json");
        });

        // fake texture loading
        sandbox.stub(FontCatalog as any, "loadTexture").callsFake((url: URL) => {
            return {
                image: {
                    width: 512,
                    height: 512
                }
            };
        });

        if (inNodeContext) {
            const theGlobal: any = global;
            theGlobal.window = {
                window: { devicePixelRatio: 1.0 },
                location: {
                    href: "http://mocha-test"
                }
            };
            theGlobal.navigator = {};
            theGlobal.requestAnimationFrame = (cb: () => void) => {
                return setTimeout(() => cb(), 15);
            };
            theGlobal.cancelAnimationFrame = (id: any) => {
                return clearTimeout(id);
            };
            theGlobal.performance = { now: Date.now };
        }

        addEventListenerSpy = sinon.stub();
        removeEventListenerSpy = sinon.stub();
        canvas = ({
            clientWidth: 800,
            clientHeight: 600,
            addEventListener: addEventListenerSpy,
            removeEventListener: removeEventListenerSpy
        } as unknown) as HTMLCanvasElement;

        mapView = new MapView({
            canvas,
            decoderCount: 0,
            theme: ThemeLoader.load(THEME),
            enableRoadPicking: true
        });

        await waitForEvent(mapView, MapViewEventNames.ThemeLoaded);

        const geoJsonDataProvider = new GeoJsonDataProvider("italy_test", GEOJSON_DATA, {
            tiler: new GeoJsonTiler()
        });

        geoJsonDataSource = new OmvDataSource({
            decoder: new OmvTileDecoder(),
            dataProvider: geoJsonDataProvider,
            name: "geojson",
            styleSetName: "geojson",
            gatherFeatureIds: true,
            createTileInfo: true
        });

        await mapView.addDataSource(geoJsonDataSource);
    });

    afterEach(function() {
        sandbox.restore();
        mapView.dispose();
        if (inNodeContext) {
            delete global.window;
            delete global.requestAnimationFrame;
            delete global.cancelAnimationFrame;
            delete global.navigator;
        }
    });

    it("Decoded tile is created", async () => {
        let tile = geoJsonDataSource.getTile(tileKey);

        assert(tile !== undefined);
        tile = tile as OmvTile;

        assert.notEqual(tile.tileLoader, undefined);

        const state = await tile.tileLoader!.loadAndDecode();
        assert.equal(state, TileLoaderState.Ready);

        const decodeTile = tile.decodedTile as DecodedTile;
        assert.notEqual(decodeTile, undefined);

        assert.notEqual(decodeTile.textGeometries, undefined);
        assert.notEqual(decodeTile.geometries, undefined);
        assert.equal(decodeTile.geometries.length, 2);

        const tileInfo = decodeTile.tileInfo as ExtendedTileInfo;
        assert.notEqual(tileInfo, undefined);

        describe("Test decodeTile, tileInfo data", () => {
            let lineGeometry: Geometry | undefined;

            it("Decoded tile contains text pick info", () => {
                assert.equal(decodeTile.textGeometries!.length, 1);
                const textElem = decodeTile.textGeometries![0];

                assert.notEqual(textElem.objInfos, undefined);
                assert.equal(
                    (textElem.objInfos![0] as any).name,
                    GEOJSON_DATA.features[2].properties.name
                );
            });

            it("Decoded tile contains line pick data pointer", () => {
                lineGeometry = decodeTile.geometries!.find(
                    geometry => geometry.type === GeometryType.SolidLine
                );

                assert.notEqual(lineGeometry, undefined);
                assert.notEqual(lineGeometry!.groups, undefined);
                assert.equal(lineGeometry!.groups.length, 1);
            });

            it("TilInfo contains line pick data", () => {
                assert.notEqual(tileInfo.lineGroup, undefined);

                assert.notEqual(tileInfo.lineGroup.positionIndex, undefined);
                assert.equal(tileInfo.lineGroup.positionIndex.length, 1);

                assert.notEqual(tileInfo.lineGroup.userData, undefined);
                assert.equal(tileInfo.lineGroup.userData.length, 1);

                const index = tileInfo.lineGroup.positionIndex[0] as number;
                assert.equal(lineGeometry!.groups[0].start, index);

                const userData = tileInfo.lineGroup.userData[index] as any;
                assert.notEqual(userData, undefined);
                assert.equal(userData.name, GEOJSON_DATA.features[1].properties!.name);
            });

            it("decodedTile contains polygon objInfos", () => {
                const polygonGeometry = decodeTile.geometries!.find(
                    geometry => geometry.type === GeometryType.Polygon
                ) as Geometry;

                assert.notEqual(polygonGeometry, undefined, "polygon geometry missing");
                assert.notEqual(
                    polygonGeometry.groups,
                    undefined,
                    "polygon geometry groups missing"
                );
                assert.equal(polygonGeometry.groups.length, 1);
                assert.notEqual(polygonGeometry.objInfos, undefined, "objInfos missing");
                assert.equal(polygonGeometry.objInfos!.length, 1);

                const objInfo = polygonGeometry.objInfos![0] as any;
                assert.equal(objInfo.name, GEOJSON_DATA.features[0].properties.name);
            });
        });
    });

    // emulate a real pick in browser
    it("Pick polygon", async () => {
        const POLYGON_DATA = GEOJSON_DATA.features[0];
        const POINT = GEOJSON_DATA.features[3];
        const pointCoordinates = ((POINT.geometry as any).coordinates as any) as number[];

        const point = new GeoCoordinates(pointCoordinates[1], pointCoordinates[0]);
        await displayLocation(mapView, point);

        const screenPointLocation = mapView.getScreenPosition(point) as THREE.Vector2;
        assert.notEqual(screenPointLocation, undefined);

        mapView.worldRootObject.children.forEach(object => {
            object.updateMatrixWorld(true);
            object.updateMatrix();
        });

        const usableIntersections = mapView
            .intersectMapObjects(screenPointLocation.x, screenPointLocation.y)
            .filter(item => item.userData !== undefined);

        assert.equal(usableIntersections.length, 1);
        assert.equal(usableIntersections[0].userData!.name, POLYGON_DATA.properties.name);
    });

    // emulate a real pick in browser
    it("Pick line", async () => {
        const LINE_DATA = GEOJSON_DATA.features[1];
        const coordinates = ((LINE_DATA.geometry as any).coordinates as any) as number[][];
        const pointLocation = new GeoCoordinates(coordinates[1][1], coordinates[1][0]);

        await displayLocation(mapView, pointLocation);

        const screenPointLocation = mapView.getScreenPosition(pointLocation) as THREE.Vector2;
        assert.notEqual(screenPointLocation, undefined);

        const usableIntersections = mapView
            .intersectMapObjects(screenPointLocation.x, screenPointLocation.y)
            .filter(item => item.userData !== undefined);

        assert.equal(usableIntersections.length, 1);
        assert.equal(usableIntersections[0].userData!.name, LINE_DATA.properties.name);
    });

    // emulate a real pick in browser
    it("Pick point", async () => {
        const POINT_DATA = GEOJSON_DATA.features[2];
        const coordinates = ((POINT_DATA.geometry as any).coordinates as any) as number[];
        const pointLocation = new GeoCoordinates(coordinates[1], coordinates[0]);

        await displayLocation(mapView, pointLocation);

        const screenPointLocation = mapView.getScreenPosition(pointLocation) as THREE.Vector2;
        assert.notEqual(screenPointLocation, undefined);

        const usableIntersections = mapView
            .intersectMapObjects(screenPointLocation.x, screenPointLocation.y)
            .filter(item => item.userData !== undefined);

        assert.equal(usableIntersections.length, 1);
        assert.equal(usableIntersections[0].userData!.name, POINT_DATA.properties.name);
    });
});
