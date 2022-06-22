/**
 * Boson Protocol Domain Enum: EvaluationMethod
 */
class EvaluationMethod {}

EvaluationMethod.None = 0;
EvaluationMethod.AboveThreshold = 1;
EvaluationMethod.SpecificToken = 2;

EvaluationMethod.Types = [EvaluationMethod.None, EvaluationMethod.AboveThreshold, EvaluationMethod.SpecificToken];

// Export
module.exports = EvaluationMethod;
