/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { MapEnv, ValueMap } from "@here/harp-datasource-protocol/index-decoder";
import { GeoBox, TileKey } from "@here/harp-geoutils";
import { ILogger } from "@here/harp-utils";
import { Vector2 } from "three";
import { IGeometryProcessor, ILineGeometry, IPolygonGeometry } from "./IGeometryProcessor";
import { OmvFeatureFilter } from "./OmvDataFilter";
import { OmvDataAdapter } from "./OmvDecoder";
import { isArrayBufferLike } from "./OmvUtils";

const VT_JSON_EXTENTS = 4096;

type VTJsonPosition = [number, number];

enum VTJsonGeometryType {
    Unknown,
    Point,
    LineString,
    Polygon
}

interface VTJsonFeatureInterface {
    geometry: VTJsonPosition[] | VTJsonPosition[][];
    id: string;
    tags: ValueMap;
    type: VTJsonGeometryType;
}

interface VTJsonSourceInterface {
    geometry: number[];
    length: number;
    id: string;
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    tags: ValueMap;
    type: string;
}

interface VTJsonTileInterface {
    features: VTJsonFeatureInterface[];
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
    numFeatures: number;
    numPoints: number;
    numSimplified: number;
    source: VTJsonSourceInterface[];
    transformed: boolean;
    x: number;
    y: number;
    z: number;
    layer: string;
}

/**
 * [[OmvDataAdapter]] id for [[VTJsonDataAdapter]].
 */
export const VTJsonDataAdapterId: string = "vt-json";

/**
 * The class [[VTJsonDataAdapter]] converts VT-json data to geometries for the given
 * [[IGeometryProcessor]].
 */
export class VTJsonDataAdapter implements OmvDataAdapter {
    id = VTJsonDataAdapterId;

    constructor(
        readonly m_processor: IGeometryProcessor,
        private m_dataFilter?: OmvFeatureFilter,
        readonly m_logger?: ILogger
    ) {}

    get dataFilter(): OmvFeatureFilter | undefined {
        return this.m_dataFilter;
    }

    set dataFilter(dataFilter: OmvFeatureFilter | undefined) {
        this.m_dataFilter = dataFilter;
    }

    canProcess(data: ArrayBufferLike | {}): boolean {
        if (isArrayBufferLike(data)) {
            return false;
        }

        const tile = data as VTJsonTileInterface;
        if (
            tile.features === undefined ||
            tile.source === undefined ||
            tile.x === undefined ||
            tile.y === undefined ||
            tile.z === undefined
        ) {
            return false;
        }

        return true;
    }

    process(tile: VTJsonTileInterface, tileKey: TileKey, geoBox: GeoBox) {
        for (const feature of tile.features) {
            const env = new MapEnv({
                ...feature.tags,
                $layer: tile.layer,
                $geometryType: this.convertGeometryType(feature.type),
                $level: tileKey.level,
                id: feature.id
            });

            switch (feature.type) {
                case VTJsonGeometryType.Point: {
                    for (const pointGeometry of feature.geometry) {
                        const x = (pointGeometry as VTJsonPosition)[0];
                        const y = (pointGeometry as VTJsonPosition)[1];

                        const position = new Vector2(x, y);

                        this.m_processor.processPointFeature(
                            tile.layer,
                            VT_JSON_EXTENTS,
                            [position],
                            env,
                            tileKey.level
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.LineString: {
                    for (const lineGeometry of feature.geometry as VTJsonPosition[][]) {
                        const line: ILineGeometry = { positions: [] };
                        for (const [x, y] of lineGeometry) {
                            const position = new Vector2(x, y);
                            line.positions.push(position);
                        }

                        this.m_processor.processLineFeature(
                            tile.layer,
                            VT_JSON_EXTENTS,
                            [line],
                            env,
                            tileKey.level
                        );
                    }
                    break;
                }
                case VTJsonGeometryType.Polygon: {
                    const polygon: IPolygonGeometry = { rings: [] };
                    for (const outline of feature.geometry as VTJsonPosition[][]) {
                        const ring: Vector2[] = [];
                        for (const [currX, currY] of outline) {
                            const position = new Vector2(currX, currY);
                            ring.push(position);
                        }
                        polygon.rings.push(ring);
                    }

                    this.m_processor.processPolygonFeature(
                        tile.layer,
                        VT_JSON_EXTENTS,
                        [polygon],
                        env,
                        tileKey.level
                    );

                    break;
                }
                case VTJsonGeometryType.Unknown: {
                    break;
                }
            }
        }
    }

    private convertGeometryType(type: VTJsonGeometryType): string {
        switch (type) {
            case VTJsonGeometryType.Point:
                return "point";
            case VTJsonGeometryType.LineString:
                return "line";
            case VTJsonGeometryType.Polygon:
                return "polygon";
            default:
                return "unknown";
        }
    }
}
