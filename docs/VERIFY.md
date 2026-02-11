# Performance Verification

## 🧪 Environment and Demo

### Demo Sites
We have prepared two AI-generated Demo projects specifically for testing, deployed on GitHub Pages:
- **[Demo Repository](https://github.com/gaoxiao6331/prefetcher-examples)**
- **Site A (Entry Page)**: A static HTML page. It determines whether to enable the prefetching function based on the `prefetch` parameter in the URL.
- **Site B (Target Page)**: A modern web application built with React + Rsbuild. When prefetching is enabled on Site A, Site B's critical resources will be pre-loaded.

| Site A (Entry) | Site B (Target) |
| :---: | :---: |
| ![Site A](./img/site-a.jpg) | ![Site B](./img/site-b.jpg) |

### Test Machine Configuration
- **Device**: MacBook Pro 2019 (16-inch, 32GB RAM)
- **Environment**: Node.js v20.18.1

---

## 🚀 Execution Flow

The verification process consists of two steps: generating the latest resource list, and then running the automation test script to compare performance data.

### 1. Generate Critical Resource List
Run `res_gen.sh` in the `script` directory. This script calls the prefetcher service to analyze Site B and uploads the core resource list to the CDN.
```bash
cd script
./res_gen.sh
```

### 2. Run Automation Verification
Use `test-prefetch.js` to perform multiple rounds of testing. The script automatically simulates both "No Prefetch" and "With Prefetch" scenarios and collects metrics.

> **Note on Waiting Delay**: In the "With Prefetch" scenario, the script waits for a specific duration (controlled by parameters) after prefetching is triggered on Site A. This ensures that the prefetched resources are fully loaded before navigating to Site B, providing a realistic measure of the performance gain.

#### Standard Test (Default 2000ms Waiting Time)
Run 20 rounds of testing to get stable average values, with a default wait of 2000ms to ensure resource prefetching is complete:
```bash
node test-prefetch.js 20
```
**Expected Result Example:**
![Result](./img/result.jpg)

#### Reduced Waiting Time Test (100ms Waiting Time)
Test the scenario where the prefetch resource loading time is short under extreme conditions.
```bash
# Argument 1: Number of test rounds (20)
# Argument 2: Waiting delay before navigation (100ms)
node test-prefetch.js 20 100
```
**Expected Result Example:**
![Result](./img/result-delay-100.jpg)

---

## 📊 Metrics Explanation

The script compares the following Key Performance Indicators (KPIs):
- **TTFB (Time to First Byte)**: Time to first byte.
- **FCP (First Contentful Paint)**: First contentful paint time.
- **LCP (Largest Contentful Paint)**: Largest contentful paint time.
- **Load Time**: Total time for the page to fully load.

Through the comparison table, you can clearly see the significant improvement percentages for each metric (especially LCP and Load Time) after enabling prefetch.
