interface DecimalMoney {
  toFixed(decimalPlaces: number): string
}

export function serializeMoney(value: DecimalMoney): string {
  return value.toFixed(2)
}
