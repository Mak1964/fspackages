class CJ4_FMC extends FMCMainDisplay {
    constructor() {
        super(...arguments);
        this._registered = false;
        this._isRouteActivated = false;
        this._lastUpdateAPTime = NaN;
        this.refreshFlightPlanCooldown = 0;
        this.updateAutopilotCooldown = 0;
        this._hasSwitchedToHoldOnTakeOff = false;
        this._previousApMasterStatus = false;
        this._apMasterStatus = false;
        this._apHasDeactivated = false;
        this._hasReachedTopOfDescent = false;
        this._apCooldown = 500;
        this.reserveFuel = 750;
        this.paxNumber = 0;
        this.cargoWeight = 0;
        this.basicOperatingWeight = 10280;
    	this.grossWeight = 10280;
		this.zFWActive = 0;
		this.zFWPilotInput = 0;
        this.takeoffOat = "□□□";
        this.landingOat = "□□□";
        this.takeoffQnh = "□□.□□";
        this.landingQnh = "□□.□□";
        this.takeoffWindDir = "---";
        this.takeoffWindSpeed = "---";
        this.landingWindDir = "---";
        this.landingWindSpeed = "---";
        this.takeoffPressAlt = "";
        this.landingPressAlt = "";
        this.depRunwayCondition = 0;
        this.arrRunwayCondition = 0;
        this.takeoffFlaps = 15;
        this.takeoffAntiIce = 0;
        this.endTakeoffDist = 0;
        this.initialFuelLeft = 0;
        this.initialFuelRight = 0;
        this.selectedRunwayOutput = "";
        this.toVSpeedStatus = CJ4_FMC.VSPEED_STATUS.NONE;
        this.appVSpeedStatus = CJ4_FMC.VSPEED_STATUS.NONE;
        this._fpHasChanged = false;
        this._activatingDirectTo = false;
        this._templateRenderer = undefined;
        this._msg = "";
        this._activatingDirectToExisting = false;
        this.vfrLandingRunway = undefined;
        this.modVfrRunway = false;
        this.deletedVfrLandingRunway = undefined;
        this.selectedWaypoint = undefined;
        this.selectMode = CJ4_FMC_LegsPage.SELECT_MODE.NONE;
        SimVar.SetSimVarValue("TRANSPONDER STATE:1", "Enum", 1);
    }
    get templateID() { return "CJ4_FMC"; }

    // Property for EXEC handling
    get fpHasChanged() { return this._fpHasChanged; }
    set fpHasChanged(value) {
        this._fpHasChanged = value;
        if (this._fpHasChanged) {
            this._templateRenderer.showExec();
        } else {
            this._templateRenderer.hideExec();
        }
    }

    connectedCallback() {
        super.connectedCallback();
        this.radioNav.init(NavMode.TWO_SLOTS);
        if (!this._registered) {
            RegisterViewListener("JS_LISTENER_KEYEVENT", () => {
                console.log("JS_LISTENER_KEYEVENT registered.");
                RegisterViewListener("JS_LISTENER_FACILITY", () => {
                    console.log("JS_LISTENER_FACILITY registered.");
                    this._registered = true;
                });
            });
        }
    }
    Init() {
        super.Init();

        // Maybe this gets rid of slowdown on first fpln mod
        this.flightPlanManager.copyCurrentFlightPlanInto(1);

        // init WT_FMC_Renderer.js
        this._templateRenderer = new WT_FMC_Renderer(this);

        this.maxCruiseFL = 450;
        this.onFplan = () => { CJ4_FMC_RoutePage.ShowPage1(this); };
        this.onLegs = () => { CJ4_FMC_LegsPage.ShowPage1(this); };
        this.onIdx = () => { CJ4_FMC_InitRefIndexPage.ShowPage1(this); };
        this.onDepArr = () => { CJ4_FMC_DepArrPage.ShowPage1(this); };
        this.onDsplMenu = () => { CJ4_FMC_DsplMenuPage.ShowPage1(this); };
        this.onPerf = () => { CJ4_FMC_PerfInitPage.ShowPage1(this); };
        this.onMfdAdv = () => { CJ4_FMC_MfdAdvPage.ShowPage1(this); };
        this.onTun = () => { CJ4_FMC_NavRadioPage.ShowPage1(this); };
        this.onExec = () => {
            this.messageBox = "Working . . .";
            if (this.onExecPage) {
                console.log("if this.onExecPage");
                this.onExecPage();
            }
            else {
                // console.log("onExec Else");
                this._isRouteActivated = false;
                // console.log("onExec else this._isRouteActivated = false");
                this.fpHasChanged = false;
                // console.log("onExec else this.fpHasChanged = false");
                this.messageBox = "";
                // console.log("onExec else this.messageBox.innerHTML");
                this._activatingDirectTo = false;
                // console.log("onExec else this._activatingDirectTo = false");
            }
        };
        this.onExecPage = undefined;
        this.onExecDefault = () => {
            if (this.getIsRouteActivated() && !this._activatingDirectTo) {
                // console.log("running this.getIsRouteActivated() && !this._activatingDirectTo");
                this.insertTemporaryFlightPlan(() => {
                    this.copyAirwaySelections();
                    this._isRouteActivated = false;
                    SimVar.SetSimVarValue("L:FMC_EXEC_ACTIVE", "number", 0);
                    // console.log("done with onExec insert temp");
                    this.fpHasChanged = false;
                    // console.log("this.fpHasChanged = false");
                    this.messageBox = "";
                    if (this.refreshPageCallback) {
                        this.refreshPageCallback();
                    }
                });
            }
            else {
                // console.log("running onExecDefault else");
                this.fpHasChanged = false;
                // console.log("fpHasChanged = false");
                this.messageBox = "";
                this._isRouteActivated = false;
                SimVar.SetSimVarValue("L:FMC_EXEC_ACTIVE", "number", 0);
                if (this.refreshPageCallback) {
                    this._activatingDirectTo = false;
                    this.fpHasChanged = false;
                    // console.log("Else refreshPageCallback");
                    this.refreshPageCallback();
                }
            }
            this._activatingDirectToExisting = false;
        };

        CJ4_FMC_InitRefIndexPage.ShowPage5(this);

        //Timer for periodic page refresh
        this._pageRefreshTimer = null;

        //Hijaack and amend the standard FMC logic to work with the PL21 TUNE page
        let initRadioNav = super.initRadioNav.bind(this);
        this.initRadioNav = (_boot) => {
            initRadioNav(_boot);
            this.initializeStandbyRadios(_boot);
        };

        const fuelWeight = SimVar.GetSimVarValue("FUEL WEIGHT PER GALLON", "pounds");
        this.initialFuelLeft = Math.trunc(SimVar.GetSimVarValue("FUEL LEFT QUANTITY", "gallons") * fuelWeight);
        this.initialFuelRight = Math.trunc(SimVar.GetSimVarValue("FUEL RIGHT QUANTITY", "gallons") * fuelWeight);
    }
    Update() {
        super.Update();
        this.updateAutopilot();
        this.adjustFuelConsumption();
        this.updateFlightLog();
    }
    onInputAircraftSpecific(input) {
        console.log("CJ4_FMC.onInputAircraftSpecific input = '" + input + "'");
        if (input === "LEGS") {
            if (this.onLegs) {
                this.onLegs();
            }
            return true;
        }
        if (input === "FPLN") {
            if (this.onFplan) {
                this.onFplan();
            }
            return true;
        }
        if (input === "DSPL_MENU") {
            if (this.onDsplMenu) {
                this.onDsplMenu();
            }
            return true;
        }
        if (input === "IDX") {
            if (this.onIdx) {
                this.onIdx();
            }
            return true;
        }
        if (input === "PERF") {
            if (this.onPerf) {
                this.onPerf();
            }
            return true;
        }
        if (input === "MFD_ADV") {
            if (this.onMfdAdv) {
                this.onMfdAdv();
            }
            return true;
        }
        if (input === "TUN") {
            if (this.onTun) {
                this.onTun();
            }
            return true;
        }
        if (input === "DIR") {
            CJ4_FMC_DirectToPage.ShowPage(this);
        }
        if (input === "EXEC") {
            if (this.onExec) {
                this.onExec();
            }
            return true;
        }

        return false;
    }

    setMsg(value = "") {
        this._msg = value;
        this._templateRenderer.setMsg(value);
    }

    clearDisplay() {
        super.clearDisplay();
        this._templateRenderer.clearDisplay.apply(this);
        this.onPrevPage = EmptyCallback.Void;
        this.onNextPage = EmptyCallback.Void;

        this.unregisterPeriodicPageRefresh();
    }

    getOrSelectWaypointByIdent(ident, callback) {
        this.dataManager.GetWaypointsByIdent(ident).then((waypoints) => {
            const uniqueWaypoints = new Map();
            waypoints.forEach(wp => {
                uniqueWaypoints.set(wp.icao, wp);
            });
            waypoints = [...uniqueWaypoints.values()];
            if (!waypoints || waypoints.length === 0) {
                return callback(undefined);
            }
            if (waypoints.length === 1) {
                this.facilityLoader.UpdateFacilityInfos(waypoints[0]).then(() => {
                    return callback(waypoints[0]);
                });
            } else {
                CJ4_FMC_SelectWptPage.ShowPage(this, waypoints, selectedWaypoint => {
                    this.facilityLoader.UpdateFacilityInfos(selectedWaypoint).then(() => {
                        return callback(selectedWaypoint);
                    });
                });
            }
        });
    }
    updateSideButtonActiveStatus() {
    }
    getIsRouteActivated() {
        return this._isRouteActivated;
    }
    activateRoute(callback = EmptyCallback.Void) {
        this._isRouteActivated = true;
        this.fpHasChanged = true;
        SimVar.SetSimVarValue("L:FMC_EXEC_ACTIVE", "number", 1);
        callback();
    }
    //function added to set departure enroute transition index
    setDepartureEnrouteTransitionIndex(departureEnrouteTransitionIndex, callback = EmptyCallback.Boolean) {
        this.ensureCurrentFlightPlanIsTemporary(() => {
            this.flightPlanManager.setDepartureEnRouteTransitionIndex(departureEnrouteTransitionIndex, () => {
                callback(true);
            });
        });
    }
    //function added to set arrival runway transition index
    setArrivalRunwayTransitionIndex(arrivalRunwayTransitionIndex, callback = EmptyCallback.Boolean) {
        this.ensureCurrentFlightPlanIsTemporary(() => {
            this.flightPlanManager.setArrivalRunwayIndex(arrivalRunwayTransitionIndex, () => {
                callback(true);
            });
        });
    }
    //function added to set arrival and runway transition
    setArrivalAndRunwayIndex(arrivalIndex, enrouteTransitionIndex, callback = EmptyCallback.Boolean) {
        this.ensureCurrentFlightPlanIsTemporary(() => {
            console.log("Setting Landing Runway");
            let landingRunway = this.flightPlanManager.getApproachRunway();
            console.log("Set Landing Runway");
            this.flightPlanManager.setArrivalProcIndex(arrivalIndex, () => {
                console.log("Set Arrival Procedure Index");
                this.flightPlanManager.setArrivalEnRouteTransitionIndex(enrouteTransitionIndex, () => {
                    console.log("Set Enroute Transition Index");
                    if (landingRunway) {
                        console.log("If Landing Runway");
                        let arrival = this.flightPlanManager.getArrival();
                        let arrivalRunwayIndex = arrival.runwayTransitions.findIndex(t => {
                            return t.name.indexOf(landingRunway.designation) != -1;
                        });
                        if (arrivalRunwayIndex >= -1) {
                            console.log("Setting Arrival Runway Index");
                            return this.flightPlanManager.setArrivalRunwayIndex(arrivalRunwayIndex, () => {
                                return callback(true);
                            });
                        }
                    }
                    return callback(true);
                });
            });
        });
    }
    updateAutopilot() {
        let now = performance.now();
        let dt = now - this._lastUpdateAPTime;
        this._lastUpdateAPTime = now;
        if (isFinite(dt)) {
            this.updateAutopilotCooldown -= dt;
        }
        if (SimVar.GetSimVarValue("L:AIRLINER_FMC_FORCE_NEXT_UPDATE", "number") === 1) {
            SimVar.SetSimVarValue("L:AIRLINER_FMC_FORCE_NEXT_UPDATE", "number", 0);
            this.updateAutopilotCooldown = -1;
        }
        if (this.updateAutopilotCooldown < 0) {
            let currentApMasterStatus = SimVar.GetSimVarValue("AUTOPILOT MASTER", "boolean");
            if (currentApMasterStatus != this._apMasterStatus) {
                this._apMasterStatus = currentApMasterStatus;
            }
            this._apHasDeactivated = !currentApMasterStatus && this._previousApMasterStatus;
            this._previousApMasterStatus = currentApMasterStatus;
            let isVNAVActivate = SimVar.GetSimVarValue("L:XMLVAR_VNAVButtonValue", "boolean");
            let currentAltitude = Simplane.getAltitude();
            let groundSpeed = Simplane.getGroundSpeed();
            let planeCoordinates = new LatLong(SimVar.GetSimVarValue("PLANE LATITUDE", "degree latitude"), SimVar.GetSimVarValue("PLANE LONGITUDE", "degree longitude"));
            if (isVNAVActivate) {
                let prevWaypoint = this.flightPlanManager.getPreviousActiveWaypoint();
                let nextWaypoint = this.flightPlanManager.getActiveWaypoint();
                if (nextWaypoint && (nextWaypoint.legAltitudeDescription === 3 || nextWaypoint.legAltitudeDescription === 4)) {
                    let targetAltitude = nextWaypoint.legAltitude1;
                    if (nextWaypoint.legAltitudeDescription === 4) {
                        targetAltitude = Math.max(nextWaypoint.legAltitude1, nextWaypoint.legAltitude2);
                    }
                    let showTopOfDescent = false;
                    let topOfDescentLat;
                    let topOfDescentLong;
                    this._hasReachedTopOfDescent = true;
                    if (currentAltitude > targetAltitude + 40) {
                        let vSpeed = 3000;
                        let descentDuration = Math.abs(targetAltitude - currentAltitude) / vSpeed / 60;
                        let descentDistance = descentDuration * groundSpeed;
                        let distanceToTarget = Avionics.Utils.computeGreatCircleDistance(prevWaypoint.infos.coordinates, nextWaypoint.infos.coordinates);
                        showTopOfDescent = true;
                        let f = 1 - descentDistance / distanceToTarget;
                        topOfDescentLat = Avionics.Utils.lerpAngle(planeCoordinates.lat, nextWaypoint.infos.lat, f);
                        topOfDescentLong = Avionics.Utils.lerpAngle(planeCoordinates.long, nextWaypoint.infos.long, f);
                        if (distanceToTarget + 1 > descentDistance) {
                            this._hasReachedTopOfDescent = false;
                        }
                    }
                    if (showTopOfDescent) {
                        SimVar.SetSimVarValue("L:AIRLINER_FMS_SHOW_TOP_DSCNT", "number", 1);
                        SimVar.SetSimVarValue("L:AIRLINER_FMS_LAT_TOP_DSCNT", "number", topOfDescentLat);
                        SimVar.SetSimVarValue("L:AIRLINER_FMS_LONG_TOP_DSCNT", "number", topOfDescentLong);
                    }
                    else {
                        SimVar.SetSimVarValue("L:AIRLINER_FMS_SHOW_TOP_DSCNT", "number", 0);
                    }
                    let altitude = Simplane.getAutoPilotSelectedAltitudeLockValue("feet");
                    let constraintRespected = false;
                    if (isFinite(nextWaypoint.legAltitude1) && altitude <= nextWaypoint.legAltitude1) {
                        if (this._hasReachedTopOfDescent) {
                            SimVar.SetSimVarValue("K:ALTITUDE_SLOT_INDEX_SET", "number", 2);
                            Coherent.call("AP_ALT_VAR_SET_ENGLISH", 2, nextWaypoint.legAltitude1, true);
                            SimVar.SetSimVarValue("L:AP_CURRENT_TARGET_ALTITUDE_IS_CONSTRAINT", "number", 1);
                            constraintRespected = true;
                        }
                    }
                    if (!constraintRespected) {
                        SimVar.SetSimVarValue("K:ALTITUDE_SLOT_INDEX_SET", "number", 0);
                        SimVar.SetSimVarValue("L:AP_CURRENT_TARGET_ALTITUDE_IS_CONSTRAINT", "number", 0);
                    }
                }
                else {
                    SimVar.SetSimVarValue("K:ALTITUDE_SLOT_INDEX_SET", "number", 0);
                    SimVar.SetSimVarValue("L:AP_CURRENT_TARGET_ALTITUDE_IS_CONSTRAINT", "number", 0);
                }
            }
            else {
                SimVar.SetSimVarValue("K:ALTITUDE_SLOT_INDEX_SET", "number", 0);
                SimVar.SetSimVarValue("L:AP_CURRENT_TARGET_ALTITUDE_IS_CONSTRAINT", "number", 0);
            }
            if (!this.flightPlanManager.isActiveApproach()) {
                let activeWaypoint = this.flightPlanManager.getActiveWaypoint();
                let nextActiveWaypoint = this.flightPlanManager.getNextActiveWaypoint();
                if (activeWaypoint && nextActiveWaypoint) {
                    let pathAngle = nextActiveWaypoint.bearingInFP - activeWaypoint.bearingInFP;
                    while (pathAngle < 180) {
                        pathAngle += 360;
                    }
                    while (pathAngle > 180) {
                        pathAngle -= 360;
                    }
                    let absPathAngle = 180 - Math.abs(pathAngle);
                    let airspeed = Simplane.getIndicatedSpeed();
                    if (airspeed < 400) {
                        let turnRadius = airspeed * 360 / (1091 * 0.36 / airspeed) / 3600 / 2 / Math.PI;
                        let activateDistance = Math.pow(90 / absPathAngle, 1.6) * turnRadius * 1.2;
                        let distanceToActive = Avionics.Utils.computeGreatCircleDistance(planeCoordinates, activeWaypoint.infos.coordinates);
                        if (distanceToActive < activateDistance) {
                            this.flightPlanManager.setActiveWaypointIndex(this.flightPlanManager.getActiveWaypointIndex() + 1);
                        }
                    }
                }
            }
            SimVar.SetSimVarValue("SIMVAR_AUTOPILOT_AIRSPEED_MIN_CALCULATED", "knots", Simplane.getStallProtectionMinSpeed());
            SimVar.SetSimVarValue("SIMVAR_AUTOPILOT_AIRSPEED_MAX_CALCULATED", "knots", Simplane.getMaxSpeed(Aircraft.CJ4));
            this.updateAutopilotCooldown = this._apCooldown;
        }
    }
    //add new method to find correct runway designation (with leading 0)
    getRunwayDesignation(selectedRunway) {
        if (selectedRunway) {
            let selectedRunwayDesignation = new String(selectedRunway.designation);
            let selectedRunwayMod = new String(selectedRunwayDesignation.slice(-1));
            if (selectedRunwayMod == "L" || selectedRunwayMod == "C" || selectedRunwayMod == "R") {
                if (selectedRunwayDesignation.length == 2) {
                    this.selectedRunwayOutput = "0" + selectedRunwayDesignation;
                } else {
                    this.selectedRunwayOutput = selectedRunwayDesignation;
                }
            } else {
                if (selectedRunwayDesignation.length == 2) {
                    this.selectedRunwayOutput = selectedRunwayDesignation;
                } else {
                    this.selectedRunwayOutput = "0" + selectedRunwayDesignation;
                }
            }
        }
        return this.selectedRunwayOutput;
    }
    //end of new method to find runway designation

    /**
     * Registers a periodic page refresh with the FMC display.
     * @param {number} interval The interval, in ms, to run the supplied action.
     * @param {function} action An action to run at each interval. Can return a bool to indicate if the page refresh should stop.
     * @param {boolean} runImmediately If true, the action will run as soon as registered, and then after each
     * interval. If false, it will start after the supplied interval.
     */
    registerPeriodicPageRefresh(action, interval, runImmediately) {
        let refreshHandler = () => {
            let isBreak = action();
            if (isBreak) return;
            this._pageRefreshTimer = setTimeout(refreshHandler, interval);
        };

        if (runImmediately) {
            refreshHandler();
        }
        else {
            this._pageRefreshTimer = setTimeout(refreshHandler, interval);
        }
    }

    /**
     * Unregisters a periodic page refresh with the FMC display.
     */
    unregisterPeriodicPageRefresh() {
        if (this._pageRefreshTimer) {
            clearInterval(this._pageRefreshTimer);
        }
    }

    /**
     * Initializes the standby radios in the FMC.
     * @param {Boolean} isFirstBoot 
     */
    initializeStandbyRadios(isFirstBoot) {
        if (this.isPrimary) {
            if (isFirstBoot) {
                this.rcl1Frequency = this.radioNav.getVHFStandbyFrequency(this.instrumentIndex, 1);
                this.pre2Frequency = this.radioNav.getVHFStandbyFrequency(this.instrumentIndex, 2);
            }
            else {
                if (Math.abs(this.radioNav.getVHFStandbyFrequency(this.instrumentIndex, 1) - this.rcl1Frequency) > 0.005) {
                    this.radioNav.setVHFStandbyFrequency(this.instrumentIndex, 1, this.rcl1Frequency);
                }
                if (Math.abs(this.radioNav.getVHFStandbyFrequency(this.instrumentIndex, 2) - this.pre2Frequency) > 0.005) {
                    this.radioNav.setVHFStandbyFrequency(this.instrumentIndex, 2, this.pre2Frequency);
                }
            }
        }
    }

    /**
     * Adjusts fuel consumption by returning fuel to the tanks and updates the
     * local fuel consumption lvar.
     */
    adjustFuelConsumption() {

        const leftFuelQty = SimVar.GetSimVarValue("FUEL LEFT QUANTITY", "gallons");
        const rightFuelQty = SimVar.GetSimVarValue("FUEL RIGHT QUANTITY", "gallons");

        if (this.previousRightFuelQty === undefined && this.previousLeftFuelQty === undefined) {
            this.previousLeftFuelQty = leftFuelQty;
            this.previousRightFuelQty = rightFuelQty;
        }
        else {
            const thrustLeft = SimVar.GetSimVarValue("TURB ENG JET THRUST:1", "pounds");
            const thrustRight = SimVar.GetSimVarValue("TURB ENG JET THRUST:2", "pounds");

            const pphLeft = SimVar.GetSimVarValue("ENG FUEL FLOW PPH:1", "pounds per hour");
            const pphRight = SimVar.GetSimVarValue("ENG FUEL FLOW PPH:2", "pounds per hour");

            const leftFuelUsed = this.previousLeftFuelQty - leftFuelQty;
            const rightFuelUsed = this.previousRightFuelQty - rightFuelQty;

            const mach = SimVar.GetSimVarValue("AIRSPEED MACH", "mach");
            const tsfc = Math.pow(1 + (1.2 * mach), mach) * 0.58; //Inspiration: https://onlinelibrary.wiley.com/doi/pdf/10.1002/9780470117859.app4

            const leftFuelFlow = pphLeft > 5 ? Math.max(thrustLeft * tsfc, 150) : 0;
            const rightFuelFlow = pphRight > 5 ? Math.max(thrustRight * tsfc, 150) : 0;

            SimVar.SetSimVarValue("L:CJ4 FUEL FLOW:1", "pounds per hour", leftFuelFlow);
            SimVar.SetSimVarValue("L:CJ4 FUEL FLOW:2", "pounds per hour", rightFuelFlow);

            if ((rightFuelUsed > 0.005 && rightFuelUsed < 1) || (leftFuelUsed > 0.005 && rightFuelUsed < 1)) {

                let leftCorrectionFactor = 1;
                let rightCorrectionFactor = 1;

                if (pphLeft > 0) {
                    leftCorrectionFactor = leftFuelFlow / pphLeft;
                }
                
                if (pphRight > 0) {
                    rightCorrectionFactor = rightFuelFlow / pphRight;
                }
                
                const newLeftFuelQty = this.previousLeftFuelQty - (leftFuelUsed * leftCorrectionFactor);
                const newRightFuelQty = this.previousRightFuelQty - (rightFuelUsed * rightCorrectionFactor);

                SimVar.SetSimVarValue("FUEL TANK LEFT MAIN QUANTITY", "gallons", newLeftFuelQty);
                SimVar.SetSimVarValue("FUEL TANK RIGHT MAIN QUANTITY", "gallons", newRightFuelQty);

                this.previousLeftFuelQty = newLeftFuelQty;
                this.previousRightFuelQty = newRightFuelQty;
            }
            else {
                this.previousLeftFuelQty = leftFuelQty;
                this.previousRightFuelQty = rightFuelQty;
            }
        }
    }
    
    // Copy airway selections from temporary to active flightplan
    copyAirwaySelections() {
        let temporaryFPWaypoints = this.flightPlanManager.getWaypoints(1);
        let activeFPWaypoints = this.flightPlanManager.getWaypoints(0);
        for (let i = 0; i < activeFPWaypoints.length; i++) {
            if (activeFPWaypoints[i].infos && temporaryFPWaypoints[i] && activeFPWaypoints[i].icao === temporaryFPWaypoints[i].icao && temporaryFPWaypoints[i].infos) {
                activeFPWaypoints[i].infos.airwayIn = temporaryFPWaypoints[i].infos.airwayIn;
                activeFPWaypoints[i].infos.airwayOut = temporaryFPWaypoints[i].infos.airwayOut;
            }
        }
    }
    
    updateFlightLog(){
        const takeOffTime = SimVar.GetSimVarValue("L:TAKEOFF_TIME", "seconds");
        const landingTime = SimVar.GetSimVarValue("L:LANDING_TIME", "seconds");
        const onGround = SimVar.GetSimVarValue("SIM ON GROUND", "Bool");
        const altitude = SimVar.GetSimVarValue("PLANE ALT ABOVE GROUND", "number");
        const zuluTime = SimVar.GetGlobalVarValue("ZULU TIME", "seconds");

        // Update takeoff time
        if(!takeOffTime){
            if (!onGround && altitude > 15){
                if(zuluTime){
                    SimVar.SetSimVarValue("L:TAKEOFF_TIME", "seconds", zuluTime);
                }
            }
        }
        else if (takeOffTime && takeOffTime > 0 && landingTime && landingTime > 0){
            if (!onGround && altitude > 15){
                if(zuluTime){
                    SimVar.SetSimVarValue("L:TAKEOFF_TIME", "seconds", zuluTime);
                }
                SimVar.SetSimVarValue("L:LANDING_TIME", "seconds", 0); // Reset landing time
                SimVar.SetSimVarValue("L:ENROUTE_TIME", "seconds", 0); // Reset enroute time
            }
        }

        
        if(takeOffTime && takeOffTime > 0){
            // Update landing time
            if(onGround && (!landingTime || landingTime == 0)){
                if(zuluTime){
                    SimVar.SetSimVarValue("L:LANDING_TIME", "seconds", zuluTime);
                }
            }
            // Update enroute time
            if(!landingTime || landingTime == 0){
                const enrouteTime = zuluTime - takeOffTime;
                SimVar.SetSimVarValue("L:ENROUTE_TIME", "seconds", enrouteTime);
            }
        }
    }
}


CJ4_FMC.VSPEED_STATUS = {
    NONE: 0,
    INPROGRESS: 1,
    SENT: 2,
};

registerInstrument("cj4-fmc", CJ4_FMC);
//# sourceMappingURL=CJ4_FMC.js.map
