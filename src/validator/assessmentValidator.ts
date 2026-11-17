import { z } from "zod";
import { AssessmentUnitInput } from "../types/assessment";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .nullable();

const addressSchema = z.object({
  addressIndex: z.number().int().min(0),
  streetNumber: z.string().max(20).nullable(),
  streetNumberSuffix: z.string().max(10).nullable(),
  streetNumberHigh: z.string().max(20).nullable(),
  streetType: z.string().max(20).nullable(),
  streetDirection: z.string().max(10).nullable(),
  streetName: z.string().max(150).nullable(),
  apartmentNumber: z.string().max(20).nullable(),
  formattedAddress: z.string().max(255).nullable(),
});

const ownerStatusSchema = z.object({
  ownerIndex: z.number().int().min(0),
  registrationDate: isoDateSchema,
  schoolTaxStatusCode: z.string().max(5).nullable(),
});

const taxDistributionSchema = z.object({
  distributionType: z.enum(["RL0504", "RL0507"]),
  distributionIndex: z.number().int().min(0),
  taxCategoryCode: z.string().max(20).nullable(),
  taxableValue: z.number().int().min(0).nullable(),
  nonTaxableValue: z.number().int().min(0).nullable(),
  legalReferenceCode: z.string().max(50).nullable(),
});

export const assessmentUnitSchema = z.object({
  naturalKey: z.string().min(5).max(120),
  municipalityCode: z.string().min(1).max(10),
  rollYear: z.number().int().min(1990).max(2100),
  boroughCode: z.string().max(10).nullable(),
  matriculeFull: z.string().min(3).max(64),
  matriculeDivision: z.string().min(1).max(10),
  matriculeSection: z.string().min(1).max(10),
  matriculeEmplacement: z.string().min(1).max(10),
  matriculeSubdivision: z.string().max(10).nullable(),
  matriculeBuilding: z.string().max(10).nullable(),
  matriculeUnit: z.string().max(10).nullable(),
  matriculeZone: z.string().max(10).nullable(),
  matriculeDiscriminant: z.string().max(10).nullable(),
  predominantUseCode: z.string().max(10).nullable(),
  fileNumber: z.string().max(30).nullable(),
  neighborhoodUnit: z.string().max(20).nullable(),
  registrationConditionCode: z.string().max(5).nullable(),
  lotFrontageM: z.number().min(0).nullable(),
  lotAreaSqm: z.number().min(0).nullable(),
  agriculturalZoneCode: z.string().max(5).nullable(),
  buildingFloors: z.number().int().min(0).max(200).nullable(),
  constructionYear: z.number().int().min(1600).max(2100).nullable(),
  constructionYearType: z.string().max(2).nullable(),
  buildingFloorAreaSqm: z.number().min(0).nullable(),
  constructionTypeCode: z.string().max(10).nullable(),
  physicalLinkCode: z.string().max(10).nullable(),
  dwellingUnitsCount: z.number().int().min(0).nullable(),
  rentalRoomsCount: z.number().int().min(0).nullable(),
  nonResidentialUnitsCount: z.number().int().min(0).nullable(),
  marketReferenceDate: isoDateSchema,
  landValue: z.number().int().min(0).nullable(),
  buildingValue: z.number().int().min(0).nullable(),
  totalPropertyValue: z.number().int().min(0).nullable(),
  previousRollValue: z.number().int().min(0).nullable(),
  servicedVacantLandCode: z.string().max(5).nullable(),
  nonResidentialClassCode: z.string().max(10).nullable(),
  industrialClassCode: z.string().max(10).nullable(),
  addresses: z.array(addressSchema),
  ownerStatuses: z.array(ownerStatusSchema),
  taxDistributions: z.array(taxDistributionSchema),
});

export type ValidationResult =
  | { success: true; data: AssessmentUnitInput }
  | { success: false; errorMessage: string };

export function validateAssessmentUnit(input: unknown): ValidationResult {
  const parsed = assessmentUnitSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    return { success: false, errorMessage: details };
  }
  return { success: true, data: parsed.data };
}