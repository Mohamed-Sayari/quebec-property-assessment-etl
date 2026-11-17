import {
  AssessmentAddressInput,
  AssessmentOwnerStatusInput,
  AssessmentTaxDistributionInput,
  RollHeader,
  XmlNode,
} from "../types/assessment";

function getFirstChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.get(name)?.[0];
}

function getAllChildren(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.get(name) ?? [];
}

function getText(node: XmlNode | undefined, name: string): string | null {
  const child = getFirstChild(node, name);
  if (!child) return null;
  const trimmed = child.text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalNumber(raw: string | null): number | null {
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseOptionalInteger(raw: string | null): number | null {
  const num = parseOptionalNumber(raw);
  if (num === null) return null;
  return Math.trunc(num);
}

function buildFormattedAddress(parts: {
  streetNumber: string | null;
  streetNumberSuffix: string | null;
  streetNumberHigh: string | null;
  streetType: string | null;
  streetLink: string | null;
  streetName: string | null;
  streetDirection: string | null;
  apartmentNumber: string | null;
}): string | null {
  const numberPart = [
    parts.streetNumber,
    parts.streetNumberSuffix,
    parts.streetNumberHigh ? `- ${parts.streetNumberHigh}` : null,
  ]
    .filter(Boolean)
    .join("");

  const streetPart = [
    parts.streetType,
    parts.streetLink,
    parts.streetName,
    parts.streetDirection,
  ]
    .filter(Boolean)
    .join(" ");

  const aptPart = parts.apartmentNumber ? `app. ${parts.apartmentNumber}` : null;

  const full = [numberPart, streetPart, aptPart].filter(Boolean).join(" ").trim();
  return full.length > 0 ? full : null;
}

export function transformUnitNode(unitNode: XmlNode, header: RollHeader) {
  const matriculeNode = getFirstChild(unitNode, "RL0104");
  const matriculeDivision = getText(matriculeNode, "RL0104A") ?? "";
  const matriculeSection = getText(matriculeNode, "RL0104B") ?? "";
  const matriculeEmplacement = getText(matriculeNode, "RL0104C") ?? "";
  const matriculeSubdivision = getText(matriculeNode, "RL0104D");
  const matriculeBuilding = getText(matriculeNode, "RL0104E");
  const matriculeUnit = getText(matriculeNode, "RL0104F");
  const matriculeZone = getText(matriculeNode, "RL0104G");
  const matriculeDiscriminant = getText(matriculeNode, "RL0104H");

  const matriculeFull = [
    matriculeDivision,
    matriculeSection,
    matriculeEmplacement,
    matriculeSubdivision,
    matriculeBuilding,
    matriculeUnit,
    matriculeZone,
    matriculeDiscriminant,
  ]
    .filter((segment): segment is string => Boolean(segment))
    .join("-");

  const naturalKey = `${header.municipalityCode}:${header.rollYear}:${matriculeFull}`;

  // 1:N Addresses (RL0101 -> RL0101x)
  const addressContainer = getFirstChild(unitNode, "RL0101");
  const addressNodes = getAllChildren(addressContainer, "RL0101x");
  const addresses: AssessmentAddressInput[] = addressNodes.map((addrNode, idx) => {
    const streetNumber = getText(addrNode, "RL0101Ax");
    const streetNumberSuffix = getText(addrNode, "RL0101Bx");
    const streetNumberHigh = getText(addrNode, "RL0101Cx");
    const streetType = getText(addrNode, "RL0101Ex");
    const streetLink = getText(addrNode, "RL0101Fx");
    const streetName = getText(addrNode, "RL0101Gx");
    const streetDirection = getText(addrNode, "RL0101Hx");
    const apartmentNumber = getText(addrNode, "RL0101Ix");

    return {
      addressIndex: idx,
      streetNumber,
      streetNumberSuffix,
      streetNumberHigh,
      streetType,
      streetDirection,
      streetName,
      apartmentNumber,
      formattedAddress: buildFormattedAddress({
        streetNumber,
        streetNumberSuffix,
        streetNumberHigh,
        streetType,
        streetLink,
        streetName,
        streetDirection,
        apartmentNumber,
      }),
    };
  });

  // 1:N Owner statuses (RL0201 -> RL0201x) + RL0201U
  const ownerContainer = getFirstChild(unitNode, "RL0201");
  const ownerNodes = getAllChildren(ownerContainer, "RL0201x");
  const ownerStatuses: AssessmentOwnerStatusInput[] = ownerNodes.map(
    (ownerNode, idx) => ({
      ownerIndex: idx,
      registrationDate: getText(ownerNode, "RL0201Gx"),
      schoolTaxStatusCode: getText(ownerNode, "RL0201Hx"),
    })
  );

  // 1:N Tax distributions (RL0504 -> RL0504x, RL0507 -> RL0507x)
  const taxDistributions: AssessmentTaxDistributionInput[] = [];
  const rl0504Nodes = getAllChildren(getFirstChild(unitNode, "RL0504"), "RL0504x");
  rl0504Nodes.forEach((node, idx) => {
    taxDistributions.push({
      distributionType: "RL0504",
      distributionIndex: idx,
      taxCategoryCode: getText(node, "RL0504Ax"),
      taxableValue: parseOptionalInteger(getText(node, "RL0504Bx")),
      nonTaxableValue: parseOptionalInteger(getText(node, "RL0504Cx")),
      legalReferenceCode: getText(node, "RL0504Dx"),
    });
  });

  const rl0507Nodes = getAllChildren(getFirstChild(unitNode, "RL0507"), "RL0507x");
  rl0507Nodes.forEach((node, idx) => {
    taxDistributions.push({
      distributionType: "RL0507",
      distributionIndex: idx,
      taxCategoryCode: getText(node, "RL0507Ax"),
      taxableValue: parseOptionalInteger(getText(node, "RL0507Bx")),
      nonTaxableValue: parseOptionalInteger(getText(node, "RL0507Cx")),
      legalReferenceCode: getText(node, "RL0507Dx"),
    });
  });

  return {
    naturalKey,
    municipalityCode: header.municipalityCode,
    rollYear: header.rollYear,
    boroughCode: getText(unitNode, "RL0102A"),
    matriculeFull,
    matriculeDivision,
    matriculeSection,
    matriculeEmplacement,
    matriculeSubdivision,
    matriculeBuilding,
    matriculeUnit,
    matriculeZone,
    matriculeDiscriminant,
    predominantUseCode: getText(unitNode, "RL0105A"),
    fileNumber: getText(unitNode, "RL0106A"),
    neighborhoodUnit: getText(unitNode, "RL0107A"),
    registrationConditionCode: getText(ownerContainer, "RL0201U"),
    lotFrontageM: parseOptionalNumber(getText(unitNode, "RL0301A")),
    lotAreaSqm: parseOptionalNumber(getText(unitNode, "RL0302A")),
    agriculturalZoneCode: getText(unitNode, "RL0303A"),
    buildingFloors: parseOptionalInteger(getText(unitNode, "RL0306A")),
    constructionYear: parseOptionalInteger(getText(unitNode, "RL0307A")),
    constructionYearType: getText(unitNode, "RL0307B"),
    buildingFloorAreaSqm: parseOptionalNumber(getText(unitNode, "RL0308A")),
    constructionTypeCode: getText(unitNode, "RL0309A"),
    physicalLinkCode: getText(unitNode, "RL0310A"),
    dwellingUnitsCount: parseOptionalInteger(getText(unitNode, "RL0311A")),
    rentalRoomsCount: parseOptionalInteger(getText(unitNode, "RL0312A")),
    nonResidentialUnitsCount: parseOptionalInteger(getText(unitNode, "RL0313A")),
    marketReferenceDate: getText(unitNode, "RL0401A"),
    landValue: parseOptionalInteger(getText(unitNode, "RL0402A")),
    buildingValue: parseOptionalInteger(getText(unitNode, "RL0403A")),
    totalPropertyValue: parseOptionalInteger(getText(unitNode, "RL0404A")),
    previousRollValue: parseOptionalInteger(getText(unitNode, "RL0405A")),
    servicedVacantLandCode: getText(unitNode, "RL0501A"),
    nonResidentialClassCode: getText(unitNode, "RL0502A"),
    industrialClassCode: getText(unitNode, "RL0503A"),
    addresses,
    ownerStatuses,
    taxDistributions,
  };
}