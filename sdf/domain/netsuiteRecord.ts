import * as log from 'N/log';
import * as record from 'N/record';

import { NetsuiteField } from './netsuiteField';
import { NetsuiteFieldIdMap } from './netsuiteFieldIdMap';

export class NetsuiteRecord {
  id?: number;
  type?: record.Type | string;
  rec?: record.Record | record.ClientCurrentRecord;

  /**
   * If record is passed to the constructor, the record's values will override other args.
   *
   * @param rec
   * @param id
   * @param type
   */
  constructor(
    rec?: record.Record | record.ClientCurrentRecord,
    id?: number,
    type?: record.Type | string
  ) {
    if (rec) {
      if (rec.id) {
        this.id = rec.id;
      }
      this.type = rec.type;
      this.rec = rec;
    } else {
      this.id = id;
      this.type = type;
    }
  }

  /**
   * Creates a record and sets it as the rec property.
   *
   * @param isDynamic - If true, creates the record in NetSuite's dynamic mode. Native NS defaults to false.
   */
  createRecord(isDynamic: boolean) {
    if (this.type) {
      this.rec = record.create({
        type: this.type,
        isDynamic,
      });
    }
  }

  /**
   * Returns an array of NetsuiteField objects.
   *
   * @remarks
   * By default, returns all of the classes properties in an array of key/value pairs.
   * To define specific fields to include or exclude, use the params.
   *
   * @param fieldIds - Optional - Array of field ids that should either be included or excluded from the array.
   * @param exclude - Optional - If true, then the fields defined in the fieldIds array will be excluded from the resulting array.
   *                             If false or not defined, the resulting array will only include the fields defined in the fieldIds array.
   * @param idMap - Optional - If provided, the record's property key values will be replaced by the corresponding fieldId value.
   * @returns fieldArr - Array of NetsuiteField objects. Each object contains a field id and corresponding value.
   */
  getFieldArray(
    fieldIds?: string[],
    exclude?: boolean,
    idMap?: NetsuiteFieldIdMap[]
  ): Array<NetsuiteField> {
    const fieldArr: Array<NetsuiteField> = [];
    for (const [key] of Object.entries(this)) {
      const idMapIndex: number = idMap
        ? idMap.findIndex(e =>
            e.propertyId.indexOf('.') > -1
              ? e.propertyId.slice(0, e.propertyId.indexOf('.')) === key
              : e.propertyId === key
          )
        : -1;
      const newFieldId: string =
        idMap && idMapIndex > -1 ? idMap[idMapIndex].fieldId : key;
      const joinProperty: string | null =
        idMap &&
        idMapIndex > -1 &&
        idMap[idMapIndex].propertyId.indexOf('.') > -1
          ? idMap[idMapIndex].propertyId.split('.')[1]
          : null;
      const newValue: record.FieldValue = joinProperty
        ? this[key as keyof object][joinProperty as keyof object]
        : this[key as keyof object];

      if (fieldIds) {
        if (exclude === true) {
          if (!fieldIds.includes(newFieldId)) {
            fieldArr.push({
              id: newFieldId,
              value:
                typeof newValue === 'object'
                  ? JSON.stringify(newValue)
                  : newValue,
            });
          }
        } else {
          if (fieldIds.includes(newFieldId)) {
            fieldArr.push({
              id: newFieldId,
              value:
                typeof newValue === 'object'
                  ? JSON.stringify(newValue)
                  : newValue,
            });
          }
        }
      } else {
        fieldArr.push({
          id: newFieldId,
          value:
            typeof this[key as keyof object] === 'object'
              ? JSON.stringify(this[key as keyof object])
              : this[key as keyof object],
        });
      }
    }
    return fieldArr;
  }

  /**
   * Returns true if the record set in the rec property can be saved
   *
   * @remarks
   * User-defined type guard to determine if rec is a standard record (i.e. it can be saved)
   *
   * @returns boolean
   */
  isStandardRecord(): this is { rec: record.Record } {
    return (this.rec as record.Record).save !== undefined;
  }

  /**
   * Loads a record from the class id & type properties and sets it as the rec property.
   *
   * @param isDynamic - If true, loads the record in NetSuite's dynamic mode. Native NS defaults to false.
   */
  loadRecord(isDynamic: boolean) {
    if (this.id && this.type) {
      this.rec = record.load({
        type: this.type,
        id: this.id,
        isDynamic,
      });
    }
  }

  /**
   * Saves the record set to the rec property.
   *
   * @remarks Typechecks to ensure the record is not a record.ClientCurrentRecord (b/c these records can't be saved).
   *
   */
  saveRecord() {
    if (this.rec && this.isStandardRecord()) {
      this.id = this.rec.save({
        ignoreMandatoryFields: true,
        enableSourcing: true,
      });
    }
  }

  /**
   * Disables field in the UI.
   *
   * @param fieldIdArr - String array containing IDs of fields to be disabled.
   * @param isDisabled - If true, the field will be disabled.
   *
   */
  setFieldsDisabled(fieldIdArr: string[], isDisabled: boolean) {
    if (!this.rec) {
      return;
    }
    for (const fieldId of fieldIdArr) {
      const thisField: record.Field | null = this.rec.getField({ fieldId });
      if (thisField) {
        thisField.isDisabled = isDisabled;
      }
    }
  }

  /**
   * Makes fields mandatory (or not) in the UI.
   *
   * @param fieldIdArr - String array containing IDs of fields to be made mandatory.
   * @param isMandatory - If true, the field will be made mandatory.
   *
   */
  setFieldsMandatory(fieldIdArr: string[], isMandatory: boolean) {
    if (!this.rec) {
      return;
    }
    for (const fieldId of fieldIdArr) {
      const thisField: record.Field | null = this.rec.getField({ fieldId });
      if (thisField) {
        thisField.isMandatory = isMandatory;
      }
    }
  }

  /**
   * Executes record.setValue function on an array of NetsuiteField objects.
   *
   * @param fields - Array of NetsuiteField objects that will be set on the record.
   * @param handleErrors - Optional - If true, the setValue function for each field will be wrapped in a try/catch.
   *
   */
  setFieldValues(fields: Array<NetsuiteField>, handleErrors?: boolean) {
    log.debug('Entered setFieldValues', { fieldCount: fields.length });
    if (this.rec) {
      if (handleErrors === true) {
        for (const field of fields) {
          try {
            this.rec.setValue({
              fieldId: field.id,
              value: field.value,
              ignoreFieldChange:
                field.ignoreFieldChange === true ? true : false,
            });
          } catch (e) {
            log.error(
              'setFieldValues error | fieldId: ' +
                field.id +
                ' | value: ' +
                field.value,
              e
            );
          }
        }
      } else {
        for (const field of fields) {
          this.rec.setValue({
            fieldId: field.id,
            value: field.value,
            ignoreFieldChange: field.ignoreFieldChange === true ? true : false,
          });
        }
      }
    }
  }

  /**
   * Gets specified field values from the record class and sets those values on the NS record object.
   *
   * @param fields - string[] - If populated, the exclude property determines behavior. If exclude is blank or false, these fields get set.
   *                            If exclude is set to true, then every field but these are set
   * @param exclude - boolean - If not set or false, the ids provided in the fields param will be the only ones set.
   *                            If true, then the ids provided in the fields param will be the only fields not set.
   * @param handleErrors - boolean - Optional - If true, the setValue function for each field will be wrapped in a try/catch.
   * @param fieldIdMap
   */
  setRecordValues(
    fields?: string[],
    exclude?: boolean,
    handleErrors?: boolean,
    fieldIdMap?: NetsuiteFieldIdMap[]
  ): void {
    this.setFieldValues(
      this.getFieldArray(fields, exclude, fieldIdMap),
      handleErrors
    );
  }
}
