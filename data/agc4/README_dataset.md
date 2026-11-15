# 4th International Autonomous Greenhouse Challenge: Results and timeseries

This dataset was generated for the 4th International Autonomous Greenhouse Challenge in the experimental facilities of the Greenhouse Horticulture Business Unit in Bleiswijk, The Netherlands in 2024.

Information regarding the competition can be found here http://www.autonomousgreenhouses.com/. The experiment in described in the accompanied paper `Autonomous Greenhouse Cultivation of Dwarf Tomato: Performance Evaluation of Intelligent Algorithms for multiple-sensor feedback` by Stef Maree, Pinglin Zhang, Bart van Marrewijk, Feije de Zwart, Monique Bijlaard, Silke Hemming"

## Canopy Camera.zip Summary
This zip file contains images, per team, which are collected during the 4th autonomous greenhouse challenge, in which 6 teams controlled a Dwarf Tomato Cultivation for about two months.

Compartment Team          Camera
3.08         Trigger      cam_18
3.07         IDEAS        cam_19
3.06         Reference    cam_1
3.03         Agrifusion   cam_20
3.02         MuGrow       cam_21
3.01         Tomatonuts   camir_27

In each compartment, images were taken with one Oak-D S2 POE camera and the dataset includes the collected RGB and Depth data. 
The camera is located about 1.5 meters above the growing crop, facing downwards. 

### 3d image reconstruction
The depth images were aligned to the color images. Consequently, the described camera intrinsics of both the depth and color images and resolution (3840 x 2160) are similar. The depth images can be converted to 3D point clouds using the intrinsics in the configs folder `canopy_camera_config.json` (`color_int`). 
See https://github.com/WURgreenhouse/point-cloud-demo for a demo on how to generate pointclouds with open3d.

### Datetime
Timestamp is included in the image filename as YYYY_MM_DD_hh_mm_ss and images are taken 4 times a day (4, 8, 12, 16 hours), recorded in the local timezone (CET/CEST).

## Timeseries.zip Summary
This zipped file contains timeseries data of 6 dwarf tomato cultivations that took place in six separate greenhouse compartments. Each compartment was autonomously controlled using intelligent algorithms developed by six interational teams. 

The teams decided on their own cultivation strategy, resulting in a rich variety of climates and results. 

Besides the timeseries data in this dataset, the accompanied canopy camera images are published as well, but for practical reasons made available separately. 

In the accompanied files, the timeseries data of each team is provided as a csv file, as well as the outside weather and weather_forecast. 

Additional information, like the unit, and if deemed nesecary, a description about each data channel (=csv column) is provided in `channel_info.json`. For example, the column named 'compartment/lower_circuit/pipe_temperature' in agrifusion.csv can be found in the json under

`components / agrifusion / components / compartment / components / lower_circuit / datastreams / pipe_temperature`

### Harvest
Harvest information, that was collected manually throughout the trial, but was not shared with the teams or their algorithms. 

## Sponsors
This dataset was generated for the 4th International Autonomous Greenhouse Challenge in the experimental facilities of the Greenhouse Horticulture Business Unit in Bleiswijk, The Netherlands in 2024. The organization of the 4th Autonomous Greenhouse Challenge has been funded by Tencent, with additional sponsorship by providing materials by Biobest, Fluence, Lensli Substrates, Pöppelmann, Quantified Sensor Technology, Certhon, Vreugdenhil Breeding & Seeds, Gebr. Geers B.V. and LetsGrow.com.

