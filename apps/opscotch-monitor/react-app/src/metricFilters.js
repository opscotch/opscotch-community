export function matchesValueCriteria(value, criteria) {
  if (!criteria.length) return true;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return false;
  return criteria.every(({ operator, value: criterionValue }) => {
    const comparisonValue = Number(criterionValue);
    if (!Number.isFinite(comparisonValue)) return false;
    if (operator === 'valueEquals') return numericValue === comparisonValue;
    if (operator === 'valueNotEquals') return numericValue !== comparisonValue;
    if (operator === 'valueGreaterThan') return numericValue > comparisonValue;
    if (operator === 'valueGreaterThanOrEqual') return numericValue >= comparisonValue;
    if (operator === 'valueLessThan') return numericValue < comparisonValue;
    if (operator === 'valueLessThanOrEqual') return numericValue <= comparisonValue;
    return true;
  });
}

export function matchesNameCriteria(name, criteria) {
  const loweredName = name.toLocaleLowerCase();
  return criteria.every(({ operator, value }) => operator !== 'contains' || loweredName.includes(String(value).toLocaleLowerCase()));
}
