# Assumptions behind a harvest recommendation

The trial recorded the actual harvest once per compartment. Harvest Window uses those measurements to evaluate ripeness forecasts. To compare profits across possible harvest dates, it also needs the pricing rules and operating assumptions below. The precise values are in [crop.yaml](../config/crop.yaml).

| Decision | Assumption used in the demo | What changes the recommendation |
| --- | --- | --- |
| How quickly will fruit turn red? | The ripening curve uses accumulated warmth above 10 °C. The last seven days of warmth set the pace for the next 21. | A change in greenhouse temperature shifts the date at which pots reach saleable condition. The 10 °C base is a modelling convention. |
| What evidence updates the curve? | Three consecutive noon images above the red-colour threshold mark the onset of ripening. An informative weighed sample moves the estimated curve midpoint 70% toward the sample. | Lighting can distort colour in a canopy image. The weighed pots measure red fruit by weight, and the sample may represent only part of the room. |
| Which pots earn revenue? | At least one-third of the fruit weight must be red. On the central price curve a pot earns €0 at 50 g red, €1.60 at 80 g and €1.80 at 150 g. The model interpolates between these points and caps revenue at 150 g. | Dry matter affects the trial price. It was unmeasured, so the central case uses the lower price curve. |
| What does waiting cost? | The model charges €0.75 per plant, includes greenhouse operating and spacing costs, and projects daily operating costs from the latest week. | Higher costs can favour an earlier harvest, especially once most pots qualify for sale. Harvest labour is excluded. |
| How much scheduling flexibility is there? | For the trial rooms, at least 95% of pots should be saleable. Around a positive peak, adjacent days within 10% of peak return form the near-peak window. | The window describes profit under the central forecast. Early and late ripening scenarios give a separate range of possible best dates. |
| Can the crop ship? | The planner treats 98% of final fruit weight as full weight. The example assumes one driver, 70 km/h for eight hours per driving day, and a 13 °C truck. | Route length, temperature, display-life requirements and delivery deadline can change the earliest feasible harvest. |

The six compartments grew one variety in one season at one site. The model uses the other rooms' full-season measurements to estimate variability between pots as a stand-in for previous crops. The trial measured greenhouse outcomes. Shipping and display-life results are scenarios.

The trial scoring rules and source measurements come from [Maree et al., *Sensors* (2025)](https://doi.org/10.3390/s25144321) and the [Wageningen trial dataset](https://doi.org/10.4121/fa102772-32db-4b30-bace-12f2016722ce).
