export interface XmlNode {
  name: string;
  text: string;
  children: Map<string, XmlNode[]>;
}

export interface RollHeader {
  schemaVersion: string | null;
  municipalityCode: string;
  rollYear: number;
}

export interface MunicipalityIndexEntry {
  municipalityCode: string;
  territoryName: string;
  sourceUrl: string;
  sourceModifiedAt: Date | null;
}

export interface AssessmentAddressInput {
  addressIndex: number;
  streetNumber: string | null;
  streetNumberSuffix: string | null;
  streetNumberHigh: string | null;
  streetType: string | null;
  streetDirection: string | null;
  streetName: string | null;
  apartmentNumber: string | null;
  formattedAddress: string | null;
}

export interface AssessmentOwnerStatusInput {
  ownerIndex: number;
  registrationDate: string | null;
  schoolTaxStatusCode: string | null;
}

export interface AssessmentTaxDistributionInput {
  distributionType: "RL0504" | "RL0507";
  distributionIndex: number;
  taxCategoryCode: string | null;
  taxableValue: number | null;
  nonTaxableValue: number | null;
  legalReferenceCode: string | null;
}

export interface AssessmentUnitInput {
  naturalKey: string;
  municipalityCode: string;
  rollYear: number;
  boroughCode: string | null;
  matriculeFull: string;
  matriculeDivision: string;
  matriculeSection: string;
  matriculeEmplacement: string;
  matriculeSubdivision: string | null;
  matriculeBuilding: string | null;
  matriculeUnit: string | null;
  matriculeZone: string | null;
  matriculeDiscriminant: string | null;
  predominantUseCode: string | null;
  fileNumber: string | null;
  neighborhoodUnit: string | null;
  registrationConditionCode: string | null;
  lotFrontageM: number | null;
  lotAreaSqm: number | null;
  agriculturalZoneCode: string | null;
  buildingFloors: number | null;
  constructionYear: number | null;
  constructionYearType: string | null;
  buildingFloorAreaSqm: number | null;
  constructionTypeCode: string | null;
  physicalLinkCode: string | null;
  dwellingUnitsCount: number | null;
  rentalRoomsCount: number | null;
  nonResidentialUnitsCount: number | null;
  marketReferenceDate: string | null;
  landValue: number | null;
  buildingValue: number | null;
  totalPropertyValue: number | null;
  previousRollValue: number | null;
  servicedVacantLandCode: string | null;
  nonResidentialClassCode: string | null;
  industrialClassCode: string | null;
  addresses: AssessmentAddressInput[];
  ownerStatuses: AssessmentOwnerStatusInput[];
  taxDistributions: AssessmentTaxDistributionInput[];
}

export interface RejectedRecordInput {
  recordIndex: number;
  naturalKey: string | null;
  errorStage: "parse" | "validate" | "transform" | "load";
  errorMessage: string;
  rawPayload: unknown;
}