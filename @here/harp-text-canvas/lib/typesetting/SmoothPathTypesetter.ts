/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import { MathUtils } from "@here/harp-utils";
import { GlyphData } from "../rendering/GlyphData";
import { QUAD_VERTEX_MEMORY_FOOTPRINT } from "../rendering/TextGeometry";
import { FontStyle, FontVariant } from "../rendering/TextStyle";
import { TypesettingUtils } from "../utils/TypesettingUtils";
import { UnicodeUtils } from "../utils/UnicodeUtils";
import { PathTypesetter, PathTypesettingParameters } from "./PathTypesetter";

/**
 * @hidden
 * [[Typesetter]] implementation that arranges glyphs alongside a specified path.
 */
export class SmoothPathTypesetter extends PathTypesetter {
    private m_tempGlyphs: GlyphData[] = [];
    private m_tempPoints: THREE.Vector2[] = [];
    private m_tempAngles: number[] = [];
    private m_tempAngleDelta: number[] = [];
    private m_tempMirrored: boolean[] = [];

    constructor() {
        super();
        this.reset();
    }

    arrangeGlyphs(params: PathTypesettingParameters): boolean {
        if (super.arrangeGlyphs(params) === false) {
            return false;
        }

        const result = this.commitLine();
        this.reset();

        return result;
    }

    // Place a directional run of index inside a path line.
    protected placeRun(
        startIdx: number,
        endIdx: number,
        direction: UnicodeUtils.Direction
    ): boolean {
        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphs;
        const smallCapsArray = this.m_currentParams!.smallCapsArray;
        const textRenderStyle = this.m_currentParams!.textRenderStyle;
        const textLayoutStyle = this.m_currentParams!.textLayoutStyle;
        const path = this.m_currentParams!.path;
        const pathOverflow = this.m_currentParams!.pathOverflow;

        // Move through the glyph array following the run's direction (as the order of the glyphs in
        // memory might not match the order on glyphs on scree).
        const start = direction === UnicodeUtils.Direction.LTR ? startIdx : endIdx;
        const end = direction === UnicodeUtils.Direction.LTR ? endIdx : startIdx;

        for (
            let i = start;
            direction === UnicodeUtils.Direction.RTL ? i >= end : i <= end;
            i += direction
        ) {
            // Only process printable characters.
            const glyphData = glyphDataArray[i];
            if (!UnicodeUtils.isPrintable(glyphData.codePoint)) {
                continue;
            }

            // When placing a RTL run, we need to check for weak runs (numerical runs of characters
            // that don't change the overall run direction, but should always be displayed as LTR
            // text).
            if (
                startIdx !== endIdx &&
                i !== 0 &&
                direction === UnicodeUtils.Direction.RTL &&
                glyphData.direction === UnicodeUtils.Direction.Weak
            ) {
                let weakRunStart = i;
                let weakGlyph = glyphDataArray[weakRunStart - 1];
                while (
                    weakRunStart !== startIdx &&
                    (weakGlyph.direction === UnicodeUtils.Direction.Weak ||
                        (weakGlyph.direction === UnicodeUtils.Direction.Neutral &&
                            !UnicodeUtils.isWhiteSpace(weakGlyph.codePoint)))
                ) {
                    --weakRunStart;
                    weakGlyph = glyphDataArray[weakRunStart - 1];
                }

                this.placeRun(Math.max(weakRunStart, startIdx), i, UnicodeUtils.Direction.LTR);

                i = weakRunStart;
                continue;
            }

            // Update the current interpolated path position and angle.
            const textPoint = path.getPoint(this.m_tempPathOffset);
            if (textPoint === null) {
                if (pathOverflow === true) {
                    break;
                } else {
                    return false;
                }
            }

            const tangent = path.getTangent(this.m_tempPathOffset);
            const angle = Math.atan2(tangent.y, tangent.x);

            const pointsLength = this.m_tempPoints.length;
            if (pointsLength > 0) {
                const prevAngle = this.m_tempAngles[pointsLength - 1];
                this.m_tempAngleDelta.push(MathUtils.circleDistance(angle - prevAngle));
            }

            this.m_tempPoints.push(textPoint);
            this.m_tempGlyphs.push(glyphData);
            this.m_tempAngles.push(angle);

            const isMirrored =
                UnicodeUtils.isRtlMirrored(glyphData.codePoint) &&
                direction === UnicodeUtils.Direction.RTL;

            this.m_tempMirrored.push(isMirrored);

            const glyphFont = glyphData.font;
            const glyphFontMetrics = glyphFont.metrics;
            const isSmallCaps = this.m_tempSmallCaps
                ? smallCapsArray![i] && textRenderStyle.fontVariant === FontVariant.SmallCaps
                : false;
            const smallCapsScale = isSmallCaps
                ? glyphFontMetrics.xHeight / glyphFontMetrics.capHeight
                : 1.0;
            const glyphScale = this.m_tempScale * smallCapsScale;

            // Advance the current position and proceed to next glyph in the run.
            this.m_tempPathOffset +=
                ((glyphData.advanceX + textLayoutStyle.tracking) * glyphScale) /
                this.m_tempPathLength;
        }

        return true;
    }

    private commitLine(): boolean {
        // Gather common typesetting parameters.
        const glyphDataArray = this.m_currentParams!.glyphs;
        const smallCapsArray = this.m_currentParams!.smallCapsArray;
        const fontCatalog = this.m_currentParams!.fontCatalog;
        const textRenderStyle = this.m_currentParams!.textRenderStyle;
        const textLayoutStyle = this.m_currentParams!.textLayoutStyle;
        const position = this.m_currentParams!.position;
        const geometry = this.m_currentParams!.geometry;
        const globalBounds = this.m_currentParams!.globalBounds;
        const individualBounds = this.m_currentParams!.individualBounds;
        const vertexBuffer = this.m_currentParams!.vertexBuffer;

        const defaultGlyphRotation = textRenderStyle.rotation;
        const normalDisplacement =
            textLayoutStyle.verticalAlignment *
            glyphDataArray[0].font.metrics.capHeight *
            this.m_tempScale;

        const e = this.m_tempPoints.length - 1;

        const v1 = new THREE.Vector2();
        const v2 = new THREE.Vector2();
        const normal = new THREE.Vector2();

        let currentAngle = this.m_tempAngles[0];
        for (let i = 0; i < this.m_tempGlyphs.length; i++) {
            const glyphData = this.m_tempGlyphs[i];
            const textPoint = this.m_tempPoints[i];

            const a0 = this.m_tempAngleDelta[i - 2 < 0 ? -(i - 2) - 1 : i - 2];
            const a1 = this.m_tempAngleDelta[i - 1 < 0 ? -(i - 1) - 1 : i - 1];
            const a2 = this.m_tempAngleDelta[i];
            const a3 = this.m_tempAngleDelta[i + 1 > e ? 2 * e + 1 - (i + 1) : i + 1];
            const a4 = this.m_tempAngleDelta[i + 2 > e ? 2 * e + 1 - (i + 2) : i + 2];

            const angleDeltaAvg = (a0 + a1 + a2 + a3 + a4) / 5;

            currentAngle += angleDeltaAvg;

            normal.set(-Math.sin(currentAngle), Math.cos(currentAngle));

            const pb = textPoint;
            const pa = this.m_tempPoints[i - 1] || pb;
            const pc = this.m_tempPoints[i + 1] || pb;

            v1.subVectors(pb, pa);
            v2.subVectors(pc, pa);

            const offset = v2
                .multiplyScalar(v2.dot(v1) / v2.dot(v2))
                .add(pa)
                .sub(pb)
                .dot(normal);

            normal.multiplyScalar(normalDisplacement + offset);
            this.m_tempPathPosition.set(normal.x + textPoint.x, normal.y + textPoint.y, position.z);
            textRenderStyle.rotation = defaultGlyphRotation + currentAngle;

            // Compute various rendering parameters for this glyph.
            const glyphFont = glyphData.font;
            const glyphFontMetrics = glyphFont.metrics;
            const fontStyle = textRenderStyle.fontStyle;

            const isBoldEmulated =
                (fontStyle === FontStyle.Bold && glyphFont.bold === undefined) ||
                (fontStyle === FontStyle.BoldItalic &&
                    glyphFont.bold === undefined &&
                    glyphFont.boldItalic === undefined);
            const isItalicEmulated =
                (fontStyle === FontStyle.Italic && glyphFont.italic === undefined) ||
                (fontStyle === FontStyle.BoldItalic &&
                    glyphFont.italic === undefined &&
                    glyphFont.boldItalic === undefined);

            const isSmallCaps = this.m_tempSmallCaps
                ? smallCapsArray![i] && textRenderStyle.fontVariant === FontVariant.SmallCaps
                : false;
            const smallCapsScale = isSmallCaps
                ? glyphFontMetrics.xHeight / glyphFontMetrics.capHeight
                : 1.0;
            const glyphScale = this.m_tempScale * smallCapsScale;

            const emulationWeight =
                ((isBoldEmulated ? 0.02 : 0.0) + (isSmallCaps ? 0.01 : 0.0)) *
                (fontCatalog.size / fontCatalog.distanceRange);
            const bgWeight =
                (0.5 * this.m_tempPixelBgSize!) /
                (fontCatalog.distanceRange * Math.max(glyphScale, 1.0));

            const isMirrored = this.m_tempMirrored[i];

            const verticalOffset =
                glyphFontMetrics.lineHeight -
                glyphFontMetrics.base -
                glyphFontMetrics.distanceRange * 0.5;

            // Compute the glyphs transformation matrix and apply to all corners of a glyph.
            TypesettingUtils.computeGlyphTransform(
                this.m_tempTransform,
                this.m_tempPathPosition,
                glyphScale,
                0.0,
                textRenderStyle.rotation
            );
            for (let j = 0; j < 4; ++j) {
                const corner = this.m_tempCorners[j];
                const glyphVertexPosition = glyphData.positions[j];
                const horizontalOffset =
                    isItalicEmulated && j > 1
                        ? TypesettingUtils.OBLIQUE_OFFSET * glyphFontMetrics.size
                        : 0.0;
                corner.set(
                    glyphVertexPosition.x + horizontalOffset,
                    glyphVertexPosition.y - verticalOffset,
                    glyphVertexPosition.z
                );
                corner.applyMatrix3(this.m_tempTransform);

                corner.x -= position.x;
                corner.y -= position.y;
            }

            // Depending on the typesetting options, add the computed glyph to the TextGeometry or
            // update the text bounds.
            if (globalBounds === undefined && vertexBuffer === undefined) {
                if (
                    !geometry.add(
                        glyphData,
                        this.m_tempCorners,
                        emulationWeight,
                        emulationWeight + bgWeight,
                        isMirrored,
                        textRenderStyle
                    )
                ) {
                    return false;
                }
            } else {
                if (globalBounds !== undefined) {
                    TypesettingUtils.updateBounds(
                        this.m_tempCorners,
                        globalBounds,
                        individualBounds
                    );
                }
                if (vertexBuffer !== undefined) {
                    geometry.addToBuffer(
                        vertexBuffer,
                        i * QUAD_VERTEX_MEMORY_FOOTPRINT,
                        glyphData,
                        this.m_tempCorners,
                        emulationWeight,
                        emulationWeight + bgWeight,
                        isMirrored,
                        textRenderStyle
                    );
                }
            }

            // Restore the original glyph rotation.
            textRenderStyle.rotation = defaultGlyphRotation;
        }

        return true;
    }

    private reset() {
        this.m_tempGlyphs = [];
        this.m_tempPoints = [];
        this.m_tempAngles = [];
        this.m_tempAngleDelta = [0];
        this.m_tempMirrored = [];
    }
}
