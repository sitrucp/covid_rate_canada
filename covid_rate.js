

var parseTime = d3.timeParse("%Y-%m-%d");
var selMetric = 'actual';

var file_cases = "https://raw.githubusercontent.com/ishaberry/Covid19Canada/master/timeseries_hr/cases_timeseries_hr.csv";
var file_hr_lookup = "https://raw.githubusercontent.com/sitrucp/canada_covid_health_regions/master/health_regions_lookup.csv";

Promise.all([
    d3.csv(file_cases),
    d3.csv(file_hr_lookup)
]).then(function(data) {

    var cases = data[0];
    var regionLookup = data[1];

    cases.forEach(function(d) {
        d.location = d.province + '|' + d.health_region
        d.date = reformatDate(d.date_report)
    });

    // orig format dd-mm-yyyy, but better as yyyy-mm-dd
    function reformatDate(oldDate) {
        var d = oldDate.split("-")
        var newDate = d[2] + '-' + d[1] + '-' + d[0]
        return newDate
    }

    // left join function used to join datasets below
    function equijoinWithDefault(xs, ys, primary, foreign, sel, def) {
        const iy = ys.reduce((iy, row) => iy.set(row[foreign], row), new Map);
        return xs.map(row => typeof iy.get(row[primary]) !== 'undefined' ? sel(row, iy.get(row[primary])): sel(row, def));
    };

    // left join lookup to case to get statscan region name
    const caseWithStatscan = equijoinWithDefault(
        cases, regionLookup, 
        "location", "province_health_region", 
        ({date, cases}, {province, statscan_arcgis_health_region}, ) => 
        ({date, province, statscan_arcgis_health_region, cases}), 
        {province_health_region:null});

    $("#btn_sort").click(function () {
        d3.selectAll('svg').remove();
        var x = document.getElementById("btn_sort");
        if (x.value === "case") {
            x.innerHTML = "Sort by health region";
            x.value = "country";
            data.sort(function(a, b){return b.avg_new_cases - a.avg_new_cases});
        } else {
            x.innerHTML = "Sort by cases";
            x.value = "case";
            data.sort(function(a, b) {
                var locA = a.location.toUpperCase();
                var locB = b.location.toUpperCase();
                return (locA < locB) ? -1 : (locA > locB) ? 1 : 0;
            });
        }
        getData();
    });

    // filter caseWithStatscan
    var cutoffDate = new Date();
    contFilter = '';
    cutoffDate.setDate(cutoffDate.getDate() - 8);

    filteredData = caseWithStatscan.filter(function(d) {
        return parseTime(d.date) > cutoffDate;
    })

    // get min and max date to write to index
    minDate = d3.min(filteredData.map(d=>d.date));
    maxDate = d3.max(filteredData.map(d=>d.date));
    document.getElementById("min_date").innerHTML += minDate;
    document.getElementById("max_date").innerHTML += maxDate;

    // group filteredData by location and mean values
    var dataHR = d3.nest()
    .key(function(d) { return d.province + "|" + d.statscan_arcgis_health_region; })
    .rollup(function(v) { 
        return {
            avg_new_cases: d3.mean(v, function(d) { return d.cases; })
        };
    })
    .entries(filteredData)
    .map(function(group) {
        return {
            location: group.key,
            avg_new_cases: group.value.avg_new_cases
        }
    });

    // group filteredData by date and mean values
    var dataByDate = d3.nest()
    .key(function(d) { return d.date; })
    .rollup(function(v) { 
        return {
            avg_new_cases: d3.sum(v, function(d) { return d.cases; })
        };
    })
    .entries(filteredData)
    .map(function(group) {
        return {
            location: group.key,
            avg_new_cases: group.value.avg_new_cases
        }
    });

    // get total for canada and append to Hr array
    canadaTotal = d3.mean(dataByDate, function(d){return d.avg_new_cases;});
    var dataCanada = [{"location":"Canada", "avg_new_cases": canadaTotal}]; 
    data = dataHR.concat(dataCanada);

    getData();

    function getData() {
        for(var i = 0; i < data.length; i++) {
            var metric = parseInt(data[i].avg_new_cases).toLocaleString("en");
            var cycleDuration = cycleCalc(data[i].avg_new_cases);
            var location = data[i].location;
            addChart(location, metric, cycleDuration);
        }
    }

    function cycleCalc(value) {
        if(Math.round(value) < 1) {
            cases = 1; 
        } else {
            cases = value;
        }
        // 24 hours = 86400000 ms
        // cases to duration eg smaller duration is faster
        cycleDuration = (1 / cases) * 86400000;
        return cycleDuration
    }

    function addChart(location, metric, cycleDuration) {
        var width = 700;
        var height = 20;
        var yText = height / 1.3;
        var yShape = height / 2;

        // create svg container
        var svgContainer = d3.select("#svg_container").append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("background-color", function(d) { 
            if(metric == 0) {
                return "#AAAAAA";
            } else {
                return "#4682B4";
            }
            });
        // create svg text location
        var svgTextLocation =  svgContainer.append("text")
        .attr("text-anchor", "start")
        .style("fill", "#FFF")
        .attr("x", 5) // 5px padding from start
        .attr("y", yText)
        .text(location);

        // create svg text metric (new cases, new cases per mil)
        var svgTextMetric =  svgContainer.append("text")
        .attr("text-anchor", "end")
        .style("fill", "#FFF")
        .attr("x", width - 5) // 5px padding from end
        .attr("y", yText)
        .text(metric);

        // create svg shape
        var svgShape = svgContainer.append("circle")
        .style("fill", "#FFF")
        .attr("cy", yShape)
        .attr("r", 5);

        var counter = 0;

        repeat();
        
        // repeat transition endless loop
        function repeat() {
            svgShape
            .attr("cx", 150)
            .transition()
            .duration(cycleDuration)
            .ease(d3.easeLinear)
            .attr("cx", 600)
            .transition()
            .duration(1)
            .attr("cx", 150)
            .on("end", repeat);
            
            svgTextMetric
            .text(counter + ' / ' + metric);
            counter++;
          };

    }

});


