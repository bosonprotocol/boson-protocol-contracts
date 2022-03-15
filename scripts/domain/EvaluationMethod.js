/**
 * Boson Protocol Domain Enum: EvaluationMethod
 */
const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
class EvaluationMethod {}

EvaluationMethod.None = 0;
EvaluationMethod.AboveThreshold = 1;
EvaluationMethod.SpecificToken = 2;

EvaluationMethod.Modes = [
    EvaluationMethod.None,
    EvaluationMethod.AboveThreshold,
    EvaluationMethod.SpecificToken
];

// Export
if (NODE) {
    module.exports = EvaluationMethod;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.EvaluationMethod = EvaluationMethod;
    }
}
