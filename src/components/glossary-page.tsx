interface GlossaryEntry {
  term: string;
  definition: string;
}

interface GlossarySection {
  title: string;
  intro: string;
  entries: readonly GlossaryEntry[];
}

const glossarySections: readonly GlossarySection[] = [
  {
    title: "Heat-pump and performance terms",
    intro: "The main terms used to compare a ground-source system with a conventional air-source system.",
    entries: [
      {
        term: "Ground-source heat pump (GSHP)",
        definition: "A heat pump that exchanges heat with the ground. Ground temperatures usually change less through the year than outdoor air temperatures, which can reduce electricity use in suitable locations.",
      },
      {
        term: "Air-source heat pump (ASHP)",
        definition: "A heat pump that exchanges heat with outdoor air. The app uses it as the comparison system when estimating the benefit of choosing a ground-source heat pump.",
      },
      {
        term: "Coefficient of performance (COP)",
        definition: "Heat or cooling delivered divided by electricity used by the heat-pump compressor at a particular condition. A COP of 4 means about four units of heating or cooling are delivered for one unit of compressor electricity. It is not an annual efficiency or a guarantee of real equipment performance.",
      },
      {
        term: "Annual performance factor (APF)",
        definition: "The app's whole-year heating and cooling delivered divided by total modelled system electricity, including configured pumps, fans and other auxiliary use. It is a modelled annual indicator, not a manufacturer rating.",
      },
      {
        term: "Thermal load",
        definition: "The amount of heating or cooling the building needs. It is measured as useful heat, not as the electricity consumed by the heat pump.",
      },
      {
        term: "System electricity",
        definition: "The modelled electricity used by the compressor plus the configured pump, fan, miscellaneous and fixed auxiliary electricity.",
      },
      {
        term: "Auxiliary electricity",
        definition: "Electricity used by supporting equipment such as circulation pumps and fans, in addition to the compressor.",
      },
      {
        term: "Scaled-Carnot COP model",
        definition: "The default formula that estimates COP from source and supply temperatures, then applies an empirical efficiency factor and limits. It is a simplified performance model rather than a product-specific test curve.",
      },
      {
        term: "Source temperature",
        definition: "The temperature from which the heat pump takes heat in heating mode, or to which it rejects heat in cooling mode. The app uses estimated ground temperature for the ground-source system and outdoor air temperature for the air-source system.",
      },
      {
        term: "Supply temperature",
        definition: "The temperature the heat pump must provide to the building's heating or cooling system. A more demanding supply temperature generally reduces COP.",
      },
      {
        term: "Heat-exchanger approach temperature",
        definition: "A simplified allowance for the temperature difference needed to transfer heat across a heat exchanger. It is included in the COP calculation.",
      },
    ],
  },
  {
    title: "Ground-temperature terms",
    intro: "These values are postcode-scale estimates prepared before the app runs; they are not site measurements.",
    entries: [
      {
        term: "Land-surface temperature",
        definition: "The long-term Australian mean land-surface temperature dataset from Geoscience Australia. It is the recommended default starting point for the ground-temperature estimate.",
      },
      {
        term: "Near-surface air temperature climatology",
        definition: "The alternative CSIRO long-term near-surface air-temperature dataset. The app displays results from this chain only when the user selects it.",
      },
      {
        term: "Estimated underground warming rate",
        definition: "The app's simple postcode-scale rate of temperature change with depth. A borehole-informed estimate of the temperature difference between the selected surface baseline and 20 m depth was spatially interpolated; the app divides that prepared difference by 20 m and assumes the same straight-line rate at the chosen depth. This is only an approximation to geothermal gradient. Measuring a true geothermal gradient requires quality-controlled downhole temperatures at suitable depths and may require corrections for drilling disturbance, groundwater flow, terrain and local geology.",
      },
      {
        term: "Geothermal gradient",
        definition: "The physical rate at which undisturbed ground temperature changes with depth. The app does not claim to provide a site-measured geothermal gradient; it uses the simpler estimated underground warming rate described above for postcode screening.",
      },
      {
        term: "Target depth",
        definition: "The depth at which the app estimates ground temperature. It is a modelling input, not a recommended borehole depth or a system design.",
      },
      {
        term: "Reference depth",
        definition: "The depth used to prepare the postcode temperature difference. The current published dataset uses 20 m.",
      },
      {
        term: "ΔT20",
        definition: "The prepared, spatially interpolated difference between the selected surface-temperature baseline and estimated ground temperature at 20 m. It is an internal evidence value, not the total uncertainty and not itself a measured geothermal gradient.",
      },
      {
        term: "Borehole",
        definition: "A drilled hole containing a temperature observation or, in an installed ground-source system, part of the ground heat exchanger. The source observations support regional estimates but do not replace a site investigation.",
      },
      {
        term: "Surface-to-borehole interpolation",
        definition: "An optional user-input method that assumes a straight-line temperature change between an entered surface temperature and an entered borehole temperature at a known depth.",
      },
    ],
  },
  {
    title: "Heating and cooling demand terms",
    intro: "How the app turns local outdoor temperatures and certificate-based annual demand into hourly estimates.",
    entries: [
      {
        term: "Heating demand threshold",
        definition: "The outdoor temperature below which the model counts heating demand. The default is 12 °C and can be changed.",
      },
      {
        term: "Cooling demand threshold",
        definition: "The outdoor temperature above which the model counts cooling demand. The default is 24 °C and can be changed.",
      },
      {
        term: "Degree-hour",
        definition: "A measure combining how far outdoor temperature is beyond a heating or cooling threshold and for how long. Degree-hours determine when the annual load is allocated; they do not create extra annual load.",
      },
      {
        term: "Heating degree-hours (HDH)",
        definition: "For each represented hour, the heating threshold minus outdoor temperature when outdoor temperature is lower than the threshold; otherwise zero.",
      },
      {
        term: "Cooling degree-hours (CDH)",
        definition: "For each represented hour, outdoor temperature minus the cooling threshold when outdoor temperature is higher than the threshold; otherwise zero.",
      },
      {
        term: "Certificate-based annual load",
        definition: "The postcode average annual heating or cooling intensity supplied with the study data, expressed per square metre. It is a starting estimate and is not the energy bill for a specific home.",
      },
      {
        term: "Allocated load",
        definition: "The annual heating or cooling load after the app distributes it across represented hours in proportion to degree-hours. If annual degree-hours are zero, the allocated load is zero under the default policy even when the certificate input is positive.",
      },
      {
        term: "Unallocated load",
        definition: "Certificate-based annual load that the model could not assign because the chosen temperature threshold produced zero annual degree-hours.",
      },
      {
        term: "Conditioned floor area",
        definition: "The floor area assumed to be heated or cooled. It scales the certificate load intensity into a total building load.",
      },
      {
        term: "Representative hour and record weight",
        definition: "The climate file stores selected hours rather than every independent hour of the year. Each record carries a weight showing how many hours it represents; together the valid records represent 8,760 hours under the default data.",
      },
    ],
  },
  {
    title: "Cost and decision terms",
    intro: "Economic results depend entirely on the electricity prices and investment assumptions entered by the user.",
    entries: [
      {
        term: "Electricity tariff",
        definition: "The price structure used to calculate electricity cost. The app supports one energy price or separate prices for a selected period and all other hours, plus optional fixed charges.",
      },
      {
        term: "Annual cost saving",
        definition: "Estimated annual air-source running cost minus estimated annual ground-source running cost. A positive number means the ground-source estimate is cheaper to run under the entered tariff.",
      },
      {
        term: "Relative electricity saving",
        definition: "Air-source electricity minus ground-source electricity, divided by air-source electricity. A positive percentage means the ground-source model uses less electricity.",
      },
      {
        term: "Installed cost",
        definition: "The total upfront cost entered for each system. The app does not estimate a quotation automatically.",
      },
      {
        term: "Lifecycle cost",
        definition: "Modelled installed, electricity, maintenance and replacement costs over the selected analysis period, converted to present value.",
      },
      {
        term: "Net present value (NPV) of choosing ground-source",
        definition: "Air-source lifecycle cost minus ground-source lifecycle cost. A positive value favours the ground-source option under the entered assumptions.",
      },
      {
        term: "Discount rate",
        definition: "The rate used to express future costs in today's value. Changing it can materially change lifecycle results.",
      },
      {
        term: "Simple payback",
        definition: "Extra ground-source installed cost divided by estimated annual operating-cost saving. It ignores the timing of future cash flows and is undefined when there is no positive annual saving.",
      },
      {
        term: "Screening result",
        definition: "An early postcode-level indication of whether a ground-source system may deserve a detailed assessment. It is not a design, site survey, thermal-response test, product selection or quotation.",
      },
      {
        term: "Evidence quality",
        definition: "A model label based on available interpolation uncertainty, distance to supporting borehole observations and certificate sample size. It describes the supporting postcode data, not the probability that an installation will succeed.",
      },
    ],
  },
  {
    title: "Data-quality terms",
    intro: "These terms appear in the optional evidence panel and technical documentation.",
    entries: [
      {
        term: "Empirical Bayesian kriging (EBK)",
        definition: "A geostatistical method used before publication to interpolate the borehole-informed 20 m temperature difference between observation locations. The browser does not run this spatial processing.",
      },
      {
        term: "Prediction standard error",
        definition: "An interpolation-quality statistic supplied for the Geoscience Australia + ΔT20 chain. It covers the ΔT20 interpolation only and is not the total uncertainty of estimated ground temperature.",
      },
      {
        term: "Zonal mean",
        definition: "The average raster value calculated inside a postcode boundary during data preparation.",
      },
      {
        term: "Certificate records",
        definition: "The number of certificate records used for the postcode load data. It is not the number of homes or residents in the postcode.",
      },
      {
        term: "Climate coverage",
        definition: "A check that valid weighted climate records represent the expected number of annual hours.",
      },
      {
        term: "User override",
        definition: "An input or model parameter that differs from the published postcode value or the app's default preset.",
      },
      {
        term: "Scenario",
        definition: "One complete combination of postcode, user inputs, model settings and calculated results. It can be exported and imported as a JSON file.",
      },
    ],
  },
];

export function GlossaryPage() {
  return (
    <div className="glossary-content">
      <nav className="glossary-jump" aria-label="Glossary sections">
        {glossarySections.map((section, index) => (
          <a key={section.title} href={`#glossary-section-${index + 1}`}>{section.title}</a>
        ))}
      </nav>
      {glossarySections.map((section, index) => (
        <section className="glossary-section" id={`glossary-section-${index + 1}`} key={section.title}>
          <header>
            <h2>{section.title}</h2>
            <p>{section.intro}</p>
          </header>
          <dl className="glossary-list">
            {section.entries.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
