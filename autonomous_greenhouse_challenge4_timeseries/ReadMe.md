# 4th International Autonomous Greenhouse Challenge: Results and timeseries

This dataset was generated for the 4th International Autonomous Greenhouse Challenge in the experimental facilities of the Greenhouse Horticulture Business Unit in Bleiswijk, The Netherlands in 2024.

Information regarding the competition can be found here http://www.autonomousgreenhouses.com/. The experiment in described in the accompanied paper `Autonomous Greenhouse Cultivation of Dwarf Tomato: Performance Evaluation of Intelligent Algorithms for multiple-sensor feedback` by Stef Maree, Pinglin Zhang, Bart van Marrewijk, Feije de Zwart, Monique Bijlaard, Silke Hemming"

## Summary
This dataset consists of timeseries data of 6 dwarf tomato cultivations that took place in six separate greenhouse compartments. Each compartment was autonomously controlled using intelligent algorithms developed by six interational teams. 

Compartment Team Name
3.01        Tomatonuts
3.02        MuGrow
3.03        Agrifusion
3.06        Reference
3.07        IDEAS
3.08        Trigger

The teams decided on their own cultivation strategy, resulting in a rich variety of climates and results. 

Besides the timeseries data in this dataset, the accompanied canopy camera images are published as well, but for practical reasons made available separately. 

In the accompanied files, the timeseries data of each team is provided as a csv file, as well as the outside weather and weather_forecast. 

Additional information, like the unit, and if deemed nesecary, a description about each data channel (=csv column) is provided in `channel_info.json`. For example, the column named 'compartment/lower_circuit/pipe_temperature' in agrifusion.csv can be found in the json under

`components / agrifusion / components / compartment / components / lower_circuit / datastreams / pipe_temperature`

## Harvest
Harvest information, that was collected manually throughout the trial, but was not shared with the teams or their algorithms. 


## Sponsors
This dataset was generated for the 4th International Autonomous Greenhouse Challenge in the experimental facilities of the Greenhouse Horticulture Business Unit in Bleiswijk, The Netherlands in 2024. The organization of the 4th Autonomous Greenhouse Challenge has been funded by Tencent, with additional sponsorship by providing materials by Biobest, Fluence, Lensli Substrates, Pöppelmann, Quantified Sensor Technology, Certhon, Vreugdenhil Breeding & Seeds, Gebr. Geers B.V. and LetsGrow.com.
