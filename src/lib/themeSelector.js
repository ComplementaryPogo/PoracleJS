const axios = require('axios')

class ThemeSelector {
	constructor(config, log) {
		this.config = config
		this.log = log
		this.sunriseSunsetCache = null
		this.sunriseSunsetCacheDate = null
	}

	async getCurrentTheme() {
		const themeConfig = this.config.geocoding.tileserverSettings?._theme
		if (!themeConfig) {
			return null
		}

		const generalTheme = this.getGeneralTheme(themeConfig.general)
		const timeOfDayTheme = await this.getTimeOfDayTheme(themeConfig.timeOfDay)

		// Combine themes: if both exist, format as "general-timeOfDay"
		// If only one exists, return that one
		// If neither exists, return null
		if (generalTheme && timeOfDayTheme) {
			return `${generalTheme}-${timeOfDayTheme}`
		}
		return generalTheme || timeOfDayTheme || null
	}

	getGeneralTheme(generalConfig) {
		if (!generalConfig) {
			return null
		}

		const now = Math.floor(Date.now() / 1000)

		// Check if current time falls within any configured time range
		if (generalConfig.times && Array.isArray(generalConfig.times)) {
			for (const timeRange of generalConfig.times) {
				if (now >= timeRange.start && now <= timeRange.end) {
					return timeRange.name
				}
			}
		}

		// Return default theme if no time range matches
		return generalConfig.default || null
	}

	async getTimeOfDayTheme(timeOfDayConfig) {
		if (!timeOfDayConfig) {
			return null
		}

		if (timeOfDayConfig.mode === 'static') {
			return this.getStaticTimeOfDay(timeOfDayConfig.times)
		} else if (timeOfDayConfig.mode === 'dynamic') {
			return this.getDynamicTimeOfDay(timeOfDayConfig)
		}

		return null
	}

	getStaticTimeOfDay(times) {
		if (!times || !Array.isArray(times)) {
			return null
		}

		const now = new Date()
		const currentMinutes = now.getHours() * 60 + now.getMinutes()

		for (const timeRange of times) {
			const [startHour, startMin] = timeRange.start.split(':').map(Number)
			const [endHour, endMin] = timeRange.end.split(':').map(Number)

			const startMinutes = startHour * 60 + startMin
			const endMinutes = endHour * 60 + endMin

			// Handle overnight ranges (e.g., 18:30 to 05:00)
			if (startMinutes > endMinutes) {
				// Current time is either after start OR before end
				if (currentMinutes >= startMinutes || currentMinutes < endMinutes) {
					return timeRange.name
				}
			} else {
				// Normal range within the same day
				if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
					return timeRange.name
				}
			}
		}

		return null
	}

	async getDynamicTimeOfDay(config) {
		if (!config.location) {
			return null
		}

		try {
			const sunData = await this.fetchSunriseSunset(config.location.lat, config.location.lon)
			if (!sunData) {
				return null
			}

			const now = new Date()
			const currentMinutes = now.getHours() * 60 + now.getMinutes()

			const sunriseMinutes = this.timeStringToMinutes(sunData.sunrise)
			const sunsetMinutes = this.timeStringToMinutes(sunData.sunset)

			// Calculate dawn period
			const dawnStart = sunriseMinutes - (config.dawn?.minutesBeforeSunrise || 30)
			const dawnEnd = sunriseMinutes + (config.dawn?.minutesAfterSunrise || 0)

			// Calculate dusk period
			const duskStart = sunsetMinutes - (config.dusk?.minutesBeforeSunset || 15)
			const duskEnd = sunsetMinutes + (config.dusk?.minutesAfterSunset || 30)

			// Determine current time of day
			if (currentMinutes >= dawnStart && currentMinutes < dawnEnd) {
				return 'dawn'
			} else if (currentMinutes >= dawnEnd && currentMinutes < duskStart) {
				return 'day'
			} else if (currentMinutes >= duskStart && currentMinutes < duskEnd) {
				return 'dusk'
			} else {
				return 'night'
			}
		} catch (error) {
			this.log.warn(`Failed to get dynamic time of day: ${error}`)
			return null
		}
	}

	async fetchSunriseSunset(lat, lon) {
		const today = new Date().toDateString()

		// Use cached data if available and from today
		if (this.sunriseSunsetCache && this.sunriseSunsetCacheDate === today) {
			return this.sunriseSunsetCache
		}

		try {
			const response = await axios.get(`https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`)

			if (response.data && response.data.status === 'OK') {
				this.sunriseSunsetCache = response.data.results
				this.sunriseSunsetCacheDate = today
				return response.data.results
			}
			return null
		} catch (error) {
			this.log.warn(`Failed to fetch sunrise-sunset data: ${error}`)
			return null
		}
	}

	timeStringToMinutes(isoString) {
		const date = new Date(isoString)
		return date.getHours() * 60 + date.getMinutes()
	}
}

module.exports = ThemeSelector
