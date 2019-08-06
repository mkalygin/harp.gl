/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BaseTechniqueParams,
    BasicExtrudedLineTechniqueParams,
    DashedLineTechniqueParams,
    ExtrudedPolygonTechniqueParams,
    FillTechniqueParams,
    isTextureBuffer,
    LineTechniqueParams,
    MarkerTechniqueParams,
    PointTechniqueParams,
    PolygonalTechniqueParams,
    SegmentsTechniqueParams,
    ShaderTechniqueParams,
    SolidLineTechniqueParams,
    StandardExtrudedLineTechniqueParams,
    StandardTechniqueParams,
    TerrainTechniqueParams,
    TextTechniqueParams,
    TextureCoordinateType
} from "./TechniqueParams";

import { Expr, JsonExpr } from "./Expr";
import { InterpolatedProperty, InterpolatedPropertyDefinition } from "./InterpolatedPropertyDefs";
import {
    AttrScope,
    mergeTechniqueDescriptor,
    TechniqueDescriptor,
    TechniqueDescriptorRegistry
} from "./TechniqueDescriptor";
/**
 * Names of the supported texture properties.
 */
export const TEXTURE_PROPERTY_KEYS = [
    "map",
    "normalMap",
    "displacementMap",
    "roughnessMap",
    "emissiveMap",
    "alphaMap",
    "metalnessMap",
    "bumpMap"
];

// TODO: Can be removed, when all when interpolators are implemented as [[Expr]]s
export type RemoveInterpolatedPropDef<T> = (T | InterpolatedPropertyDefinition<any>) extends T
    ? Exclude<T, InterpolatedPropertyDefinition<any>>
    : T;
export type RemoveJsonExpr<T> = (T | JsonExpr) extends T ? Exclude<T, JsonExpr> : T;

/**
 * Make runtime representation of technique attributes from JSON-compatible typings.
 *
 * Translates
 *  - InterpolatedPropertyDefinition -> InterpolatedProperty
 *  - JsonExpr -> Expr
 */
export type MakeTechniqueAttrs<T> = {
    [P in keyof T]: (T[P] | JsonExpr) extends T[P]
        ? RemoveInterpolatedPropDef<RemoveJsonExpr<T[P]>> | Expr | InterpolatedProperty<number>
        : T[P];
};

export const techniqueDescriptors: TechniqueDescriptorRegistry = {};

export const baseTechniqueParamsDescriptor: TechniqueDescriptor<BaseTechniqueParams> = {
    attrScopes: {
        renderOrder: AttrScope.Technique,
        renderOrderOffset: AttrScope.Technique,
        enabled: AttrScope.Technique,
        kind: AttrScope.Technique,
        transient: AttrScope.Technique,
        fadeFar: AttrScope.Renderer,
        fadeNear: AttrScope.Renderer
    }
};

export const pointTechniquePropTypes = mergeTechniqueDescriptor<PointTechniqueParams>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            texture: AttrScope.Technique,
            enablePicking: AttrScope.Technique,
            color: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            opacity: AttrScope.Technique
        }
    }
);

/**
 * Runtime representation of [[SquaresStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SquaresTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "squares";
}

export const squaresTechniquePropTypes = mergeTechniqueDescriptor<SquaresTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);
techniqueDescriptors.squares = squaresTechniquePropTypes;

/**
 * Runtime representation of [[CirclesStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface CirclesTechnique extends MakeTechniqueAttrs<PointTechniqueParams> {
    name: "circles";
}

export const circlesTechniquePropTypes = mergeTechniqueDescriptor<CirclesTechnique>(
    baseTechniqueParamsDescriptor,
    pointTechniquePropTypes
);
techniqueDescriptors.circles = circlesTechniquePropTypes;

/**
 * Runtime representation of [[PoiStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface PoiTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "labeled-icon";
}

/**
 * Runtime representation of [[LineMarkerStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineMarkerTechnique extends MakeTechniqueAttrs<MarkerTechniqueParams> {
    name: "line-marker";
}

const lineMarkerTechniquePropTypes = mergeTechniqueDescriptor<LineMarkerTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            useAbbreviation: AttrScope.Feature,
            useIsoCode: AttrScope.Feature,
            priority: AttrScope.Technique,
            textMinZoomLevel: AttrScope.Technique,
            textMaxZoomLevel: AttrScope.Technique,
            iconMinZoomLevel: AttrScope.Technique,
            iconMaxZoomLevel: AttrScope.Technique,
            distanceScale: AttrScope.Technique,
            textMayOverlap: AttrScope.Technique,
            iconMayOverlap: AttrScope.Technique,
            textReserveSpace: AttrScope.Technique,
            iconReserveSpace: AttrScope.Technique,
            renderTextDuringMovements: AttrScope.Technique,
            alwaysOnTop: AttrScope.Technique,
            textIsOptional: AttrScope.Technique,
            showOnMap: AttrScope.Technique,
            stackMode: AttrScope.Technique,
            minDistance: AttrScope.Technique,
            iconIsOptional: AttrScope.Technique,
            iconFadeTime: AttrScope.Technique,
            textFadeTime: AttrScope.Technique,
            xOffset: AttrScope.Technique,
            yOffset: AttrScope.Technique,
            iconXOffset: AttrScope.Technique,
            iconYOffset: AttrScope.Technique,
            iconScale: AttrScope.Technique,
            screenHeight: AttrScope.Technique,
            screenWidth: AttrScope.Technique,
            poiTable: AttrScope.Technique,
            poiName: AttrScope.Feature,
            poiNameField: AttrScope.Technique,
            imageTexture: AttrScope.Feature,
            imageTextureField: AttrScope.Technique,
            imageTexturePrefix: AttrScope.Technique,
            imageTexturePostfix: AttrScope.Technique,
            style: AttrScope.Technique,
            fontName: AttrScope.Technique,
            fontStyle: AttrScope.Technique,
            fontVariant: AttrScope.Technique,
            rotation: AttrScope.Technique,
            tracking: AttrScope.Technique,
            leading: AttrScope.Technique,
            maxLines: AttrScope.Technique,
            lineWidth: AttrScope.Technique,
            canvasRotation: AttrScope.Technique,
            lineRotation: AttrScope.Technique,
            wrappingMode: AttrScope.Technique,
            hAlignment: AttrScope.Technique,
            vAlignment: AttrScope.Technique,
            backgroundColor: AttrScope.Renderer,
            backgroundSize: AttrScope.Renderer,
            backgroundOpacity: AttrScope.Renderer,
            color: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            size: AttrScope.Renderer
        }
    }
);
techniqueDescriptors["line-marker"] = lineMarkerTechniquePropTypes;
/**
 * Runtime representation of [[SegmentsStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SegmentsTechnique extends MakeTechniqueAttrs<SegmentsTechniqueParams> {
    name: "segments";
}

const polygonalTechniqueDescriptor: TechniqueDescriptor<PolygonalTechniqueParams> = {
    attrScopes: {
        polygonOffset: AttrScope.Renderer,
        polygonOffsetFactor: AttrScope.Renderer,
        polygonOffsetUnits: AttrScope.Renderer,
        lineColor: AttrScope.Renderer,
        lineFadeFar: AttrScope.Renderer,
        lineFadeNear: AttrScope.Renderer
    }
};
/**
 * Runtime representation of [[BasicExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface BasicExtrudedLineTechnique
    extends MakeTechniqueAttrs<BasicExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[StandardExtrudedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface StandardExtrudedLineTechnique
    extends MakeTechniqueAttrs<StandardExtrudedLineTechniqueParams> {
    name: "extruded-line";
}

/**
 * Runtime representation of [[SolidLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface SolidLineTechnique extends MakeTechniqueAttrs<SolidLineTechniqueParams> {
    name: "solid-line";
}

export const solidLineTechniqueDescriptor = mergeTechniqueDescriptor<SolidLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
            clipping: AttrScope.Technique,
            secondaryRenderOrder: AttrScope.Technique,
            color: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            lineWidth: AttrScope.Renderer,
            secondaryWidth: AttrScope.Renderer,
            secondaryColor: AttrScope.Renderer
        }
    }
);
techniqueDescriptors["solid-line"] = solidLineTechniqueDescriptor;

/**
 * Runtime representation of [[DashedLineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface DashedLineTechnique extends MakeTechniqueAttrs<DashedLineTechniqueParams> {
    name: "dashed-line";
}

export const dashedLineTechniqueDescriptor = mergeTechniqueDescriptor<DashedLineTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
            clipping: AttrScope.Technique,
            opacity: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            lineWidth: AttrScope.Renderer,
            dashSize: AttrScope.Renderer,
            gapSize: AttrScope.Renderer
        }
    }
);

techniqueDescriptors["dashed-line"] = dashedLineTechniqueDescriptor;

/**
 * Runtime representation of [[LineStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface LineTechnique extends MakeTechniqueAttrs<LineTechniqueParams> {
    name: "line";
}

export const lineTechniqueDescriptor = mergeTechniqueDescriptor<LineTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            // TODO, check, which are really dynamic !
            color: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            lineWidth: AttrScope.Feature
        }
    }
);

techniqueDescriptors.line = lineTechniqueDescriptor;

/**
 * Runtime representation of [[FillStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface FillTechnique extends MakeTechniqueAttrs<FillTechniqueParams> {
    name: "fill";
}

const fillTechniqueDescriptor = mergeTechniqueDescriptor<FillTechnique>(
    baseTechniqueParamsDescriptor,
    polygonalTechniqueDescriptor,
    {
        attrScopes: {
            color: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            lineWidth: AttrScope.Renderer
        }
    }
);
techniqueDescriptors.fill = fillTechniqueDescriptor;

/**
 * Technique used to render a mesh geometry.
 */
export interface StandardTechnique extends MakeTechniqueAttrs<StandardTechniqueParams> {
    name: "standard";
}
const standardTechniqueDescriptor = mergeTechniqueDescriptor<StandardTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            color: AttrScope.Feature,
            vertexColors: AttrScope.Feature,
            wireframe: AttrScope.Renderer,
            roughness: AttrScope.Renderer,
            metalness: AttrScope.Renderer,
            alphaTest: AttrScope.Renderer,
            depthTest: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            emissive: AttrScope.Renderer,
            emissiveIntensity: AttrScope.Renderer,
            refractionRatio: AttrScope.Renderer,
            map: AttrScope.Technique,
            mapProperties: AttrScope.Technique,
            normalMap: AttrScope.Technique,
            normalMapProperties: AttrScope.Technique,
            displacementMap: AttrScope.Technique,
            displacementMapProperties: AttrScope.Technique,
            roughnessMap: AttrScope.Technique,
            roughnessMapProperties: AttrScope.Technique,
            emissiveMap: AttrScope.Technique,
            emissiveMapProperties: AttrScope.Technique,
            bumpMap: AttrScope.Technique,
            bumpMapProperties: AttrScope.Technique,
            metalnessMap: AttrScope.Technique,
            metalnessMapProperties: AttrScope.Technique,
            alphaMap: AttrScope.Technique,
            alphaMapProperties: AttrScope.Technique
        }
    }
);
techniqueDescriptors.standard = standardTechniqueDescriptor;

/**
 * Runtime representation of [[ExtrudedPolygonStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface ExtrudedPolygonTechnique
    extends MakeTechniqueAttrs<ExtrudedPolygonTechniqueParams> {
    name: "extruded-polygon";
}

const extrudedPolygonTechniqueDescriptor = mergeTechniqueDescriptor<ExtrudedPolygonTechnique>(
    baseTechniqueParamsDescriptor,
    standardTechniqueDescriptor,
    {
        attrScopes: {
            height: AttrScope.Feature,
            minHeight: AttrScope.Feature,
            color: AttrScope.Feature,
            defaultColor: AttrScope.Feature,
            defaultHeight: AttrScope.Feature,
            constantHeight: AttrScope.Feature,
            boundaryWalls: AttrScope.Feature,
            footprint: AttrScope.Feature,
            maxSlope: AttrScope.Feature,
            enableDepthPrePass: AttrScope.Technique,
            animateExtrusionDuration: AttrScope.Technique,
            animateExtrusion: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            transparent: AttrScope.Renderer,
            lineWidth: AttrScope.Renderer,
            lineFadeNear: AttrScope.Renderer,
            lineFadeFar: AttrScope.Renderer,
            lineColorMix: AttrScope.Technique,
            lineColor: AttrScope.Renderer
        }
    }
);
techniqueDescriptors["extruded-polygon"] = extrudedPolygonTechniqueDescriptor;
/**
 * Runtime representation of [[TextStyle]] as parsed by [[StyleSetEvaluator]].
 */
export interface TextTechnique extends MakeTechniqueAttrs<TextTechniqueParams> {
    name: "text";
}

const textTechniqueDescriptor = mergeTechniqueDescriptor<TextTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            useAbbreviation: AttrScope.Feature,
            useIsoCode: AttrScope.Feature,
            minZoomLevel: AttrScope.Technique,
            maxZoomLevel: AttrScope.Technique,
            distanceScale: AttrScope.Technique,
            mayOverlap: AttrScope.Technique,
            reserveSpace: AttrScope.Technique,
            textFadeTime: AttrScope.Technique,
            xOffset: AttrScope.Technique,
            yOffset: AttrScope.Technique,
            style: AttrScope.Technique,
            fontName: AttrScope.Technique,
            fontStyle: AttrScope.Technique,
            fontVariant: AttrScope.Technique,
            rotation: AttrScope.Technique,
            tracking: AttrScope.Technique,
            leading: AttrScope.Technique,
            maxLines: AttrScope.Technique,
            lineWidth: AttrScope.Technique,
            canvasRotation: AttrScope.Technique,
            lineRotation: AttrScope.Technique,
            wrappingMode: AttrScope.Technique,
            hAlignment: AttrScope.Technique,
            vAlignment: AttrScope.Technique,
            backgroundColor: AttrScope.Renderer,
            backgroundSize: AttrScope.Renderer,
            backgroundOpacity: AttrScope.Renderer,
            color: AttrScope.Renderer,
            opacity: AttrScope.Renderer,
            priority: AttrScope.Renderer,
            size: AttrScope.Renderer
        }
    }
);
techniqueDescriptors.text = textTechniqueDescriptor;

export interface ShaderTechnique extends MakeTechniqueAttrs<ShaderTechniqueParams> {
    /**
     * Name of technique. Is used in the theme file.
     */
    name: "shader";
}

const shaderTechniqueDescriptor = mergeTechniqueDescriptor<ShaderTechnique>(
    baseTechniqueParamsDescriptor,
    {
        attrScopes: {
            primitive: AttrScope.Technique,
            params: AttrScope.Renderer
        }
    }
);

techniqueDescriptors.shader = shaderTechniqueDescriptor;

/**
 * Technique used to render a terrain geometry with textures.
 */
export interface TerrainTechnique extends MakeTechniqueAttrs<TerrainTechniqueParams> {
    name: "terrain";
}

/**
 * Possible techniques that can be used to draw a geometry on the map.
 */
export type Technique =
    | SquaresTechnique
    | CirclesTechnique
    | PoiTechnique
    | LineMarkerTechnique
    | LineTechnique
    | SegmentsTechnique
    | SolidLineTechnique
    | DashedLineTechnique
    | FillTechnique
    | StandardTechnique
    | TerrainTechnique
    | BasicExtrudedLineTechnique
    | StandardExtrudedLineTechnique
    | ExtrudedPolygonTechnique
    | ShaderTechnique
    | TextTechnique;

/**
 * Additional params used for optimized usage of `Techniques`.
 */
export interface IndexedTechniqueParams {
    /**
     * Optimization: Index into table in [[StyleSetEvaluator]] or in [[DecodedTile]].
     * @hidden
     */
    _index: number;

    /**
     * Optimization: Unique [[Technique]] index of [[Style]] from which technique was derived.
     * @hidden
     */
    _styleSetIndex: number;
}

/**
 * For efficiency, [[StyleSetEvaluator]] returns [[Techniques]] additional params as defined in
 * [[IndexedTechniqueParams]].
 */
export type IndexedTechnique = Technique & IndexedTechniqueParams;

/**
 * Type guard to check if an object is an instance of [[CirclesTechnique]].
 */
export function isCirclesTechnique(technique: Technique): technique is CirclesTechnique {
    return technique.name === "circles";
}

/**
 * Type guard to check if an object is an instance of [[SquaresTechnique]].
 */
export function isSquaresTechnique(technique: Technique): technique is SquaresTechnique {
    return technique.name === "squares";
}

/**
 * Type guard to check if an object is an instance of [[PoiTechnique]].
 */
export function isPoiTechnique(technique: Technique): technique is PoiTechnique {
    return technique.name === "labeled-icon";
}

/**
 * Type guard to check if an object is an instance of [[LineMarkerTechnique]].
 */
export function isLineMarkerTechnique(technique: Technique): technique is LineMarkerTechnique {
    return technique.name === "line-marker";
}

/**
 * Type guard to check if an object is an instance of [[DashedLineTechnique]].
 */
export function isDashedLineTechnique(technique: Technique): technique is DashedLineTechnique {
    return technique.name === "dashed-line";
}

/**
 * Type guard to check if an object is an instance of [[LineTechnique]].
 */
export function isLineTechnique(technique: Technique): technique is LineTechnique {
    return technique.name === "line";
}

/**
 * Type guard to check if an object is an instance of [[SolidLineTechnique]].
 */
export function isSolidLineTechnique(technique: Technique): technique is SolidLineTechnique {
    return technique.name === "solid-line";
}

/**
 * Type guard to check if an object is an instance of [[SegmentsTechnique]].
 */
export function isSegmentsTechnique(technique: Technique): technique is SegmentsTechnique {
    return technique.name === "segments";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]]
 * or [[StandardExtrudedLineTechnique]].
 */
export function isExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique | StandardExtrudedLineTechnique {
    return technique.name === "extruded-line";
}

/**
 * Type guard to check if an object is an instance of [[BasicExtrudedLineTechnique]].
 */
export function isBasicExtrudedLineTechnique(
    technique: Technique
): technique is BasicExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "basic";
}

/**
 * Type guard to check if an object is an instance of [[StandardExtrudedLineTechnique]].
 */
export function isStandardExtrudedLineTechnique(
    technique: Technique
): technique is StandardExtrudedLineTechnique {
    return isExtrudedLineTechnique(technique) && technique.shading === "standard";
}

/**
 * Type guard to check if an object is an instance of [[FillTechnique]].
 */
export function isFillTechnique(technique: Technique): technique is FillTechnique {
    return technique.name === "fill";
}

/**
 * Type guard to check if an object is an instance of [[ExtrudedPolygonTechnique]].
 */
export function isExtrudedPolygonTechnique(
    technique: Technique
): technique is ExtrudedPolygonTechnique {
    return technique.name === "extruded-polygon";
}

/**
 * Type guard to check if an object is an instance of [[StandardTechnique]].
 */
export function isStandardTechnique(technique: Technique): technique is StandardTechnique {
    return technique.name === "standard";
}

/**
 * Type guard to check if an object is an instance of [[TerrainTechnique]].
 */
export function isTerrainTechnique(technique: Technique): technique is TerrainTechnique {
    return technique.name === "terrain";
}

/**
 * Type guard to check if an object is an instance of [[TextTechnique]].
 */
export function isTextTechnique(technique: Technique): technique is TextTechnique {
    return technique.name === "text";
}

/**
 * Type guard to check if an object is an instance of [[ShaderTechnique]].
 */
export function isShaderTechnique(technique: Technique): technique is ShaderTechnique {
    return technique.name === "shader";
}

/**
 * Check if vertex normals should be generated for this technique (if no normals are in the data).
 * @param technique Technique to check.
 */
export function needsVertexNormals(technique: Technique): boolean {
    return (
        isStandardTechnique(technique) ||
        isTerrainTechnique(technique) ||
        isStandardExtrudedLineTechnique(technique)
    );
}

/**
 * Get the texture coordinate type if the technique supports it.
 */
export function textureCoordinateType(technique: Technique): TextureCoordinateType | undefined {
    if (isStandardTechnique(technique)) {
        return technique.textureCoordinateType;
    } else if (isExtrudedPolygonTechnique(technique)) {
        return technique.textureCoordinateType;
    } else if (isTerrainTechnique(technique)) {
        return technique.textureCoordinateType;
    } else {
        return undefined;
    }
}

/**
 * Add all the buffers of the technique to the transfer list.
 */
export function addBuffersToTransferList(technique: Technique, transferList: ArrayBuffer[]) {
    if (
        isStandardTechnique(technique) ||
        isExtrudedPolygonTechnique(technique) ||
        isTerrainTechnique(technique)
    ) {
        for (const texturePropertyKey of TEXTURE_PROPERTY_KEYS) {
            const textureProperty = (technique as any)[texturePropertyKey];
            if (isTextureBuffer(textureProperty)) {
                if (textureProperty.buffer instanceof ArrayBuffer) {
                    transferList.push(textureProperty.buffer);
                }
            }
        }
    }
}

/**
 * Compose full texture name for given image name with technique specified.
 * Some techniques allows to add prefix/postfix to icons names specified, this
 * function uses technique information to create fully qualified texture name.
 * @param imageName base name of the marker icon.
 * @param technique the technique describing POI or line marker.
 * @returns fully qualified texture name for loading from atlas (without extension).
 */
export function composeTechniqueTextureName(
    imageName: string,
    technique: PoiTechnique | LineMarkerTechnique
): string {
    let textureName = imageName;
    if (typeof technique.imageTexturePrefix === "string") {
        textureName = technique.imageTexturePrefix + textureName;
    }
    if (typeof technique.imageTexturePostfix === "string") {
        textureName = textureName + technique.imageTexturePostfix;
    }
    return textureName;
}
