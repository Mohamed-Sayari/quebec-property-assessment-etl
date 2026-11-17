import fs from "node:fs";
import sax from "sax";
import { RollHeader, XmlNode } from "../types/assessment";

export interface StreamXmlOptions {
  filePath: string;
  onHeader: (header: RollHeader) => Promise<void> | void;
  onUnit: (unitNode: XmlNode, recordIndex: number) => Promise<void> | void;
}

function createXmlNode(name: string): XmlNode {
  return {
    name,
    text: "",
    children: new Map(),
  };
}

export async function streamAssessmentXml(
  options: StreamXmlOptions
): Promise<{ header: RollHeader; totalRead: number }> {
  const { filePath, onHeader, onUnit } = options;
  const parser = sax.parser(true, { trim: true, normalize: false });

  let schemaVersion: string | null = null;
  let municipalityCode: string | null = null;
  let rollYear: number | null = null;
  let headerEmitted = false;

  let currentHeaderTag: string | null = null;
  let currentHeaderText = "";

  const nodeStack: XmlNode[] = [];
  const completedUnitsInChunk: XmlNode[] = [];
  let recordIndex = 0;
  let parseError: Error | null = null;

  parser.onerror = (err) => {
    parseError = err;
  };

  parser.onopentag = (tag) => {
    const tagName = tag.name;

    if (nodeStack.length > 0 || tagName === "RLUEx") {
      const node = createXmlNode(tagName);
      if (nodeStack.length > 0) {
        const parent = nodeStack[nodeStack.length - 1];
        const existing = parent.children.get(tagName) ?? [];
        existing.push(node);
        parent.children.set(tagName, existing);
      }
      nodeStack.push(node);
      return;
    }

    if (tagName === "VERSION" || tagName === "RLM01A" || tagName === "RLM02A") {
      currentHeaderTag = tagName;
      currentHeaderText = "";
    }
  };

  parser.ontext = (text) => {
    if (nodeStack.length > 0) {
      nodeStack[nodeStack.length - 1].text += text;
    } else if (currentHeaderTag) {
      currentHeaderText += text;
    }
  };

  parser.oncdata = (cdata) => {
    if (nodeStack.length > 0) {
      nodeStack[nodeStack.length - 1].text += cdata;
    }
  };

  parser.onclosetag = (tagName) => {
    if (nodeStack.length > 0) {
      const popped = nodeStack.pop()!;
      popped.text = popped.text.trim();
      if (tagName === "RLUEx" && nodeStack.length === 0) {
        completedUnitsInChunk.push(popped);
      }
      return;
    }

    if (currentHeaderTag === tagName) {
      const val = currentHeaderText.trim();
      if (tagName === "VERSION") schemaVersion = val || null;
      if (tagName === "RLM01A") municipalityCode = val || null;
      if (tagName === "RLM02A") {
        const parsed = Number.parseInt(val, 10);
        if (!Number.isNaN(parsed)) rollYear = parsed;
      }
      currentHeaderTag = null;
      currentHeaderText = "";
    }
  };

  const readStream = fs.createReadStream(filePath, {
    encoding: "utf8",
    highWaterMark: 64 * 1024,
  });

  for await (const chunk of readStream) {
    parser.write(chunk as string);
    if (parseError) {
      throw parseError;
    }

    if (!headerEmitted && municipalityCode && rollYear !== null) {
      headerEmitted = true;
      await onHeader({ schemaVersion, municipalityCode, rollYear });
    }

    while (completedUnitsInChunk.length > 0) {
      const unitNode = completedUnitsInChunk.shift()!;
      recordIndex += 1;
      await onUnit(unitNode, recordIndex);
    }
  }

  parser.close();
  if (parseError) {
    throw parseError;
  }

  if (!municipalityCode || rollYear === null) {
    throw new Error(
      "Invalid XML header: missing required <RLM01A> or <RLM02A> tags"
    );
  }

  if (!headerEmitted) {
    await onHeader({ schemaVersion, municipalityCode, rollYear });
  }

  return {
    header: { schemaVersion, municipalityCode, rollYear },
    totalRead: recordIndex,
  };
}