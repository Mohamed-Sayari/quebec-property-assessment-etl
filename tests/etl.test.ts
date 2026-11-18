import { describe, expect, it } from "vitest";
import { transformUnitNode } from "../src/transformer/assessmentTransformer";
import { RollHeader, XmlNode } from "../src/types/assessment";
import { validateAssessmentUnit } from "../src/validator/assessmentValidator";

function leaf(name: string, text: string): XmlNode {
  return { name, text, children: new Map() };
}

function branch(name: string, childrenList: XmlNode[]): XmlNode {
  const children = new Map<string, XmlNode[]>();
  for (const child of childrenList) {
    const existing = children.get(child.name) ?? [];
    existing.push(child);
    children.set(child.name, existing);
  }
  return { name, text: "", children };
}

const sampleHeader: RollHeader = {
  schemaVersion: "2.9",
  municipalityCode: "01042",
  rollYear: 2026,
};

describe("Assessment ETL transformer and validator", () => {
  it("transforms and validates a complete residential/commercial unit", () => {
    const unitNode = branch("RLUEx", [
      branch("RL0101", [
        branch("RL0101x", [
          leaf("RL0101Ax", "50"),
          leaf("RL0101Ex", "CH"),
          leaf("RL0101Gx", "PRINCIPAL"),
        ]),
      ]),
      branch("RL0104", [
        leaf("RL0104A", "0075"),
        leaf("RL0104B", "34"),
        leaf("RL0104C", "3748"),
      ]),
      leaf("RL0105A", "8549"),
      leaf("RL0302A", "1282232.50"),
      leaf("RL0401A", "2024-07-01"),
      leaf("RL0402A", "199700"),
      leaf("RL0403A", "11799100"),
      leaf("RL0404A", "11998800"),
      leaf("RL0502A", "1A"),
    ]);

    const transformed = transformUnitNode(unitNode, sampleHeader);
    const validation = validateAssessmentUnit(transformed);

    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data.naturalKey).toBe("01042:2026:0075-34-3748");
      expect(validation.data.matriculeDivision).toBe("0075");
      expect(validation.data.nonResidentialClassCode).toBe("1A");
      expect(validation.data.addresses[0]?.formattedAddress).toBe("50 CH PRINCIPAL");
      expect(validation.data.totalPropertyValue).toBe(11998800);
    }
  });

  it("handles vacant lots without street number, building value, and comma decimals", () => {
    const unitNode = branch("RLUEx", [
      branch("RL0101", [
        branch("RL0101x", [
          leaf("RL0101Ex", "CH"),
          leaf("RL0101Gx", "PRINCIPAL"),
        ]),
      ]),
      branch("RL0104", [
        leaf("RL0104A", "0174"),
        leaf("RL0104B", "87"),
        leaf("RL0104C", "0100"),
      ]),
      leaf("RL0302A", "1 250,75"),
      leaf("RL0402A", "45000"),
      leaf("RL0404A", "45000"),
    ]);

    const transformed = transformUnitNode(unitNode, sampleHeader);
    const validation = validateAssessmentUnit(transformed);

    expect(validation.success).toBe(true);
    if (validation.success) {
      expect(validation.data.lotAreaSqm).toBe(1250.75);
      expect(validation.data.buildingValue).toBeNull();
      expect(validation.data.addresses[0]?.formattedAddress).toBe("CH PRINCIPAL");
    }
  });

  it("formats cardinal direction (RL0101Hx) and apartment number (RL0101Ix)", () => {
    const unitNode = branch("RLUEx", [
      branch("RL0101", [
        branch("RL0101x", [
          leaf("RL0101Ax", "124"),
          leaf("RL0101Ex", "RO"),
          leaf("RL0101Gx", "132"),
          leaf("RL0101Hx", "O"),
          leaf("RL0101Ix", "2B"),
        ]),
      ]),
      branch("RL0104", [
        leaf("RL0104A", "2576"),
        leaf("RL0104B", "91"),
        leaf("RL0104C", "8599"),
      ]),
    ]);

    const transformed = transformUnitNode(unitNode, sampleHeader);
    expect(transformed.addresses[0]?.formattedAddress).toBe("124 RO 132 O app. 2B");
  });

  it("rejects records with missing matricule or negative property value", () => {
    const invalidNode = branch("RLUEx", [
      branch("RL0104", [leaf("RL0104B", "34")]),
      leaf("RL0404A", "-500"),
    ]);

    const transformed = transformUnitNode(invalidNode, sampleHeader);
    const validation = validateAssessmentUnit(transformed);

    expect(validation.success).toBe(false);
    if (!validation.success) {
      expect(validation.errorMessage).toContain("matriculeDivision");
      expect(validation.errorMessage).toContain("totalPropertyValue");
    }
  });
});