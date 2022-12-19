/**
 * Boson Protocol Domain Enum: FacetCutAction
 */
class FacetCutAction {}

FacetCutAction.Add = 0;
FacetCutAction.Replace = 1;
FacetCutAction.Remove = 2;

FacetCutAction.Types = [FacetCutAction.Add, FacetCutAction.Replace, FacetCutAction.Remove];

// Export
module.exports = FacetCutAction;
