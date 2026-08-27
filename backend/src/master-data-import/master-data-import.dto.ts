import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { MASTER_DATA_IMPORT_DEFINITIONS, type MasterDataImportEntity } from "../contracts/master-data-import";

export const MASTER_DATA_IMPORT_ENTITIES = MASTER_DATA_IMPORT_DEFINITIONS.map(
  (definition) => definition.entity,
) as MasterDataImportEntity[];

export class MasterDataImportPreviewDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(MASTER_DATA_IMPORT_ENTITIES)
  entity!: MasterDataImportEntity;
}
