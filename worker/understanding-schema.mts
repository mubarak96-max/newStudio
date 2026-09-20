const jsonString = { type: 'string' };
const jsonNumber = { type: 'number' };
const jsonStringArray = { type: 'array', items: jsonString };

function strictObject(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function arrayOf(items: Record<string, unknown>) {
  return { type: 'array', items };
}

export const understandingResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'book_understanding_delta',
    strict: true,
    schema: strictObject({
      newEntities: arrayOf(
        strictObject({
          entityId: jsonString,
          type: { type: 'string', enum: ['character', 'location', 'object', 'group'] },
          canonicalName: jsonString,
          aliases: arrayOf(
            strictObject({
              name: jsonString,
              firstSeq: jsonNumber,
              paragraphIds: jsonStringArray,
            })
          ),
          importance: { type: 'string', enum: ['major', 'supporting', 'minor'] },
          firstSeq: jsonNumber,
          lastSeq: jsonNumber,
          paragraphIds: jsonStringArray,
        })
      ),
      facts: arrayOf(
        strictObject({
          entityId: jsonString,
          key: jsonString,
          value: jsonString,
          quote: jsonString,
          paragraphIds: jsonStringArray,
        })
      ),
      events: arrayOf(
        strictObject({
          eventId: jsonString,
          summary: jsonString,
          seqStart: jsonNumber,
          seqEnd: jsonNumber,
          storyTimeHint: jsonNumber,
          participants: jsonStringArray,
          locationId: { anyOf: [jsonString, { type: 'null' }] },
          objectIds: jsonStringArray,
          kind: jsonString,
          paragraphIds: jsonStringArray,
          evidenceQuotes: jsonStringArray,
        })
      ),
      stateChanges: arrayOf(
        strictObject({
          entityId: jsonString,
          stateId: jsonString,
          label: jsonString,
          validFromStoryTime: jsonNumber,
          validFromSeq: jsonNumber,
          changes: arrayOf(strictObject({ key: jsonString, value: jsonString })),
          paragraphIds: jsonStringArray,
          evidenceQuotes: jsonStringArray,
        })
      ),
      reveals: arrayOf(
        strictObject({
          entityId: jsonString,
          what: jsonString,
          seq: jsonNumber,
          paragraphIds: jsonStringArray,
          evidenceQuotes: jsonStringArray,
        })
      ),
      relationshipChanges: arrayOf(
        strictObject({
          entityId: jsonString,
          toEntityId: jsonString,
          type: jsonString,
          validFromSeq: jsonNumber,
          paragraphIds: jsonStringArray,
          evidenceQuotes: jsonStringArray,
        })
      ),
      aliasConflicts: arrayOf(
        strictObject({
          alias: jsonString,
          entityIds: jsonStringArray,
          paragraphIds: jsonStringArray,
        })
      ),
      updatedSynopsis: jsonString,
    }),
  },
};
