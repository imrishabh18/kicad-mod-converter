import parseSExpression from "s-expression"
import {
  attributes_def,
  kicad_mod_json_def,
  pad_def,
  type FpLine,
  type FpText,
  type KicadModJson,
  type Pad,
  type Property,
} from "./kicad-zod"
import { formatAttr, getAttr } from "./get-attr"
import Debug from "debug"

const debug = Debug("kicad-mod-converter")

export const parseKicadModToKicadJson = (fileContent: string): KicadModJson => {
  const kicadSExpr = parseSExpression(fileContent)

  const footprintName = kicadSExpr[1].valueOf()

  const topLevelAttributes: any = {}

  const simpleTopLevelAttributes = Object.entries(kicad_mod_json_def.shape)
    .filter(
      ([attributeKey, def]) =>
        def._def.typeName === "ZodString" || attributeKey === "tags"
    )
    .map(([attributeKey]) => attributeKey)
  for (const kicadSExprRow of kicadSExpr.slice(2)) {
    if (!simpleTopLevelAttributes.includes(kicadSExprRow[0])) continue

    const key = kicadSExprRow[0].valueOf()
    const val = formatAttr(kicadSExprRow.slice(1), key)
    topLevelAttributes[key] = val
  }

  const properties = kicadSExpr
    .slice(2)
    .filter((row: any[]) => row[0] === "property")
    .map((row: any) => {
      const key = row[1].valueOf()
      const val = row[2].valueOf()
      const attributes = attributes_def.parse(
        row.slice(3).reduce((acc: any, attrAr: any[]) => {
          const attrKey = attrAr[0].valueOf()
          acc[attrKey] = formatAttr(attrAr.slice(1), attrKey)
          return acc
        }, {} as any)
      )

      return {
        key,
        val,
        attributes,
      } as Property
    })

  const padRows = kicadSExpr.slice(2).filter((row: any[]) => row[0] === "pad")

  const pads: Array<Pad> = []

  for (const row of padRows) {
    const at = getAttr(row, "at")
    const size = getAttr(row, "size")
    let layers = getAttr(row, "layers")
    if (Array.isArray(layers)) {
      layers = layers.map((layer) => layer.valueOf())
    } else if (typeof layers === "string") {
      layers = [layers]
    } else if (!layers) {
      layers = []
    }

    const roundrect_rratio = getAttr(row, "roundrect_rratio")
    const uuid = getAttr(row, "uuid")
    const padRaw = {
      name: row[1].valueOf(),
      pad_type: row[2].valueOf(),
      pad_shape: row[3].valueOf(),
      at,
      size,
      layers,
      roundrect_rratio,
      uuid,
    }

    debug(`attempting to parse pad: ${JSON.stringify(padRaw, null, "  ")}`)
    pads.push(pad_def.parse(padRaw))
  }

  const fp_texts_rows = kicadSExpr
    .slice(2)
    .filter((row: any[]) => row[0] === "fp_text")

  const fp_texts: FpText[] = []

  for (const fp_text_row of fp_texts_rows) {
    const text = fp_text_row[1].valueOf()
    const at = getAttr(fp_text_row, "at")
    const layer = getAttr(fp_text_row, "layer")
    const uuid = getAttr(fp_text_row, "uuid")
    const effects = getAttr(fp_text_row, "effects")

    fp_texts.push({
      fp_text_type: "user",
      text,
      at,
      layer,
      uuid,
      effects,
    })
  }

  const fp_lines: FpLine[] = []

  const fp_lines_rows = kicadSExpr
    .slice(2)
    .filter((row: any[]) => row[0] === "fp_line")

  for (const fp_line_row of fp_lines_rows) {
    const start = getAttr(fp_line_row, "start")
    const end = getAttr(fp_line_row, "end")
    const stroke = getAttr(fp_line_row, "stroke")
    const layer = getAttr(fp_line_row, "layer")
    const uuid = getAttr(fp_line_row, "uuid")

    fp_lines.push({
      start,
      end,
      stroke,
      layer,
      uuid,
    })
  }

  return kicad_mod_json_def.parse({
    footprint_name: footprintName,
    ...topLevelAttributes,
    properties,
    fp_lines,
    fp_texts,
    pads,
  })
}
