/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Feature,
    FeatureCollection,
    FeatureGeometry,
    GeometryCollection
} from "@here/harp-datasource-protocol";
import { GeoJsonDataProvider } from "@here/harp-geojson-datasource";
import { OmvDataSource } from "@here/harp-omv-datasource";
import { MapViewFeature } from "./Features";

const NAME = "user-features-datasource";
const DEFAULT_GEOJSON: FeatureCollection = {
    type: "FeatureCollection",
    features: []
};

/**
 * [[DataSource]] implementation to use for the addition of custom features.
 */
export class FeaturesDataSource extends OmvDataSource {
    private m_featureCollection: FeatureCollection = this.emptyGeojson();

    /**
     * Builds a `FeaturesDataSource`.
     *
     * @param workerTilerUrl Worker tiler URL. Defaults to `./decoder.bundle.ts` in the
     * [[ConcurrentTilerFacade]].
     */
    constructor(workerTilerUrl?: string) {
        super({
            dataProvider: new GeoJsonDataProvider(NAME, DEFAULT_GEOJSON, { workerTilerUrl })
        });
    }

    /**
     * This method allows to directly add a GeoJSON without using [[MapViewFeature]] instances. It
     * also overwrites existing features in this data source. To add a GeoJSON without overwriting
     * the data source, one should loop through it to create [[MapViewFeature]] and add them with
     * the `add` method.
     *
     * @param geojson A javascript object matching the GeoJSON specification.
     */
    setFromGeojson(geojson: FeatureCollection | GeometryCollection | Feature) {
        if (geojson.type === "FeatureCollection") {
            this.m_featureCollection = geojson;
        } else if (geojson.type === "Feature") {
            this.m_featureCollection = this.emptyGeojson();
            this.m_featureCollection.features.push(geojson);
        } else if (geojson.type === "GeometryCollection") {
            this.m_featureCollection = this.emptyGeojson();
            for (const geometry of geojson.geometries) {
                this.m_featureCollection.features.push({
                    type: "Feature",
                    geometry
                });
            }
        } else {
            throw new TypeError("The provided object is not a valid GeoJSON object.");
        }
        this.update();
        return this;
    }

    /**
     * Adds a custom feature in the datasource.
     *
     * @param features The features to add in the datasource.
     */
    add(...features: MapViewFeature[]): this {
        for (const feature of features) {
            this.addFeature(feature);
        }
        this.update();
        return this;
    }

    /**
     * Removes a custom feature in the datasource.
     *
     * @param features The features to add in the datasource.
     */
    remove(...features: MapViewFeature[]): this {
        for (const feature of features) {
            this.removeFeature(feature);
        }
        this.update();
        return this;
    }

    /**
     * Removes all the custom features in this `FeaturesDataSource`.
     */
    clear() {
        this.m_featureCollection = this.emptyGeojson();
        this.update();
    }

    private addFeature(feature: MapViewFeature) {
        // Check if the feature is not already in there.
        const hasFeature = this.m_featureCollection.features.some(
            _feature => _feature.properties.__mapViewUuid === feature.uuid
        );
        if (hasFeature) {
            return;
        }

        // Create a GeoJson feature from the feature coordinates and push it.
        const geometry: FeatureGeometry = {
            type: feature.type,
            coordinates: feature.coordinates
        } as any;
        const geojsonFeature: Feature = {
            type: "Feature",
            geometry,
            properties: {
                ...feature.properties,
                __mapViewUuid: feature.uuid
            }
        };
        this.m_featureCollection.features.push(geojsonFeature);
    }

    private removeFeature(feature: MapViewFeature) {
        // Remove geojson feature from the root FeatureCollection.
        const index = this.m_featureCollection.features.findIndex(
            _feature => _feature.properties.__mapViewUuid === feature.uuid
        );

        if (index === -1) {
            return;
        }
        this.m_featureCollection.features.splice(index, 1);
    }

    private update() {
        (this.dataProvider() as GeoJsonDataProvider).updateInput(this.m_featureCollection);
        this.mapView.markTilesDirty(this);
        this.mapView.clearTileCache(this.name);
    }

    private emptyGeojson(): FeatureCollection {
        return {
            features: [],
            type: "FeatureCollection"
        };
    }
}
