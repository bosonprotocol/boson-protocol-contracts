/**
 * Boson Protocol Domain Enum: EvaluationMethod
 */
class EvaluationMethod {}

EvaluationMethod.None = 0;
EvaluationMethod.Threshold = 1;
EvaluationMethod.SpecificToken = 2;

EvaluationMethod.Types = [EvaluationMethod.None, EvaluationMethod.Threshold, EvaluationMethod.SpecificToken];

// Export
module.exports = EvaluationMethod;
