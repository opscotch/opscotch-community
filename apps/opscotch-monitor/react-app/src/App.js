import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MetricLineChart = React.memo(({ metricName, index, data }) => {
  const [chartData, setChartData] = useState([]);
  const colours = [
    '#FF0000', // Red
    '#0000FF', // Blue
    '#FF00FF', // Magenta
    '#800080', // Purple
    '#008080', // Teal
    '#800000', // Maroon
    '#008000', // Green
    '#000080', // Navy
    '#808000', // Olive
    '#000000'  // Black
  ];

  useEffect(() => {
    setChartData(data.map((dataPoint) => {
      const p = { timestamp: dataPoint.timestamp };
      p[metricName] = dataPoint[metricName] ?? 0;
      return p;
    }));
  }, [metricName, data]);

  return (
    <ResponsiveContainer 
      key={"r"+metricName} 
      width="30%"
      aspect={2}
      debounce={1} >
      <LineChart key={"chart" + metricName} data={chartData}>
        <XAxis dataKey="timestamp"/>
        <YAxis />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip />
        <Legend />
        <Line dataKey={metricName} type="linear" isAnimationActive={false} stroke={ colours[index % colours.length] }/>
      </LineChart>
      
    </ResponsiveContainer>
  );
});

const App = () => {
  const [loadingMessage, setLoadingMessage] = useState((<p>connecting to opscotch</p>));
  const [url, setUrl] = useState(localStorage.getItem('url') ?? "http://localhost");
  const [showConfig, setShowConfig] = useState(false);
  const [metricNames, setMetricNames] = useState([]);
  const [data, setData] = useState(Array(100).fill({ timestamp: 0}));
  
  useEffect(() => {
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  });

  const handleUrlChange = (event) => {
    setUrl(event.target.value);
  };

  const fetchData = async () => {
    try {
      const response = await fetch(`${url}/_metrics`);
      
      const metricJson = await response.json();
  
      if (metricJson) {
        setShowConfig(false);
        localStorage.setItem('url', url);


        if (Object.keys(metricJson).filter(key => key !== "timestamp").filter(val => !metricNames.includes(val)).length) {
          setMetricNames((currentMetrics) => [...currentMetrics, ...Object.keys(metricJson).filter(key => key !== "timestamp").filter(val => !currentMetrics.includes(val))]);
        }

        if (metricNames.length == 0) {
          setLoadingMessage("Waiting for metrics");
        } else {
          setLoadingMessage(null);
        }

        setData(prevData => {
          if (prevData[prevData.length-1].timestamp === metricJson.timestamp) {
            const newData = [...prevData];
            newData[newData.length-1] = metricJson;
            return newData;
          } else {
            return [ ...prevData.slice(1), metricJson ]
          }
        });
        
      }
    } catch (error) {
      if (error.message.startsWith("NetworkError")) {
        setLoadingMessage((<p>Connection problems... <br/>Is the opsotch-monitor app running at this endpoint?</p>));
        setShowConfig(true);
      }
      console.error('Error fetching data:', error);
    }
  };

  return (
    
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', padding: '1rem' }}>
        <img src="logo.png" alt="Logo" style={{ height: '40px', marginRight: '1rem' }} />
        <h1 style={{ margin: 0 }}>opscotch monitor</h1>
      </header>
      {
        <div style={{ display: 'flex', flexWrap: 'wrap'  }}>
          {
            metricNames.map((key, index) => (
              <MetricLineChart key={"m_" + key} metricName={key} data={data} index={index}/>
            ))
          }
        </div>   
      }
      {
        loadingMessage &&
        <div style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          width: '100%'
        }}>
          <div style={{ 
              background: 'white',
              opacity: '80%',
              padding: '5em',
              borderRadius: '1em'
               }}>
            <h1 style={{ 
              margin: 0,

               }}>{loadingMessage}</h1>
            {showConfig && 
              <div style={{
                
                display: 'flex',
                flexDirection: 'row'}}>
                <p>opscotch url: &nbsp;</p>
                <input type="text" value={url} onChange={handleUrlChange} />
              </div>
            }
          </div>
        </div>
      }
        
    </div>
  );
};

export default App;
