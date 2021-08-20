import React, { Component } from "react";

export interface Time {
    hh: string;
    mm: string;
    ss: string;
}

export interface VideoSeekSliderProps {
    total: number;
    current: number;
    onChange: (value: number) => void;
    buffered?: number;
    hideHoverTime?: boolean;
    secondsPrefix?: string;
    minutesPrefix?: string;
    limitTimeTooltipBySides?: boolean;
    sliderColor?: string;
    sliderHoverColor?: string;
    thumbColor?: string;
    bufferColor?: string;
    paused?: boolean;
    play?: () => void;
    pause?: () => void;
    onSeekStart?: () => void;
    onSeekEnd?: () => void;
    scale?: number;
}

export interface VideoSeekSliderStates {
    ready: boolean;
    trackWidth: number;
    seekHoverPosition: number;
}

export interface TransformType {
    transform: string;
}

export default class SeekSlider extends Component<VideoSeekSliderProps, VideoSeekSliderStates> {
    private seeking = false;
    private mobileSeeking = false;
    private track: HTMLDivElement | null = null;
    private hoverTime: HTMLDivElement | null = null;
    private offset: number = 0;
    private secondsPrefix: string = "00:00:";
    private minutesPrefix: string = "00:";
    private seekPause: boolean = false;

    public constructor(props: VideoSeekSliderProps) {
        super(props);
        if (this.props.secondsPrefix) {
            this.secondsPrefix = this.props.secondsPrefix;
        }
        if (this.props.minutesPrefix) {
            this.minutesPrefix = this.props.minutesPrefix;
        }
        this.state = {
            ready: false,
            trackWidth: 0,
            seekHoverPosition: 0,
        };
    }

    public componentDidMount(): void {
        this.setTrackWidthState();
        window.addEventListener("resize", this.setTrackWidthState);
        window.addEventListener("mousemove", this.handleSeeking);
        window.addEventListener("mouseup", this.mouseSeekingHandler);
        window.addEventListener("touchmove", this.handleTouchSeeking);
        window.addEventListener("touchend", this.mobileTouchSeekingHandler);
    }

    public componentWillUnmount(): void {
        window.removeEventListener("resize", this.setTrackWidthState);
        window.removeEventListener("mousemove", this.handleSeeking);
        window.removeEventListener("mouseup", this.mouseSeekingHandler);
        window.removeEventListener("touchmove", this.handleTouchSeeking);
        window.removeEventListener("touchend", this.mobileTouchSeekingHandler);
    }

    private handleTouchSeeking = (event: any): void => {
        let pageX: number = 0;

        for (let i = 0; i < event.changedTouches.length; i++) {
            pageX = event.changedTouches[i].pageX;
        }

        pageX = pageX < 0 ? 0 : pageX;

        if (this.mobileSeeking) {
            this.changeCurrentTimePosition(pageX);
        }
    };

    private handleSeeking = (evt: any): void => {
        if (this.seeking) {
            this.changeCurrentTimePosition(evt.pageX);
        }
    };

    private changeCurrentTimePosition(pageX: number): void {
        if (this.track) {
            const scale = this.props.scale || 1;
            let position = (pageX - this.track.getBoundingClientRect().left) / scale;
            position = Math.min(this.state.trackWidth, Math.max(0, position));
            this.setState({ seekHoverPosition: position });
            const percent = position / this.state.trackWidth;
            const time = +(percent * this.props.total).toFixed(0);
            this.props.onChange(time);
        }
    }

    private setTrackWidthState = (): void => {
        if (this.track) {
            this.setState({ trackWidth: this.track.offsetWidth });
        }
    };

    private handleTrackHover = (clear: boolean, evt: React.MouseEvent): void => {
        if (this.track) {
            const scale = this.props.scale || 1;
            let position: number;
            if (clear) {
                position = 0;
            } else {
                position = (evt.pageX - this.track.getBoundingClientRect().left) / scale;
            }
            this.setState({ seekHoverPosition: position, trackWidth: this.track.offsetWidth });
        }
    };

    private getPositionStyle(time: number): TransformType {
        const position: number = (time * 100) / this.props.total;
        return { transform: `scaleX(${position / 100})` };
    }

    private getThumbHandlerPosition(): TransformType {
        const position: number = this.state.trackWidth / (this.props.total / this.props.current);
        return { transform: `translateX(${position}px)` };
    }

    private getSeekHoverPosition(): TransformType {
        const position: number = (this.state.seekHoverPosition * 100) / this.state.trackWidth;
        return { transform: `scaleX(${position / 100})` };
    }

    private getHoverTimePosition(): TransformType {
        let position: number = 0;
        if (this.hoverTime) {
            position = this.state.seekHoverPosition - this.hoverTime.offsetWidth / 2;
            if (this.props.limitTimeTooltipBySides) {
                if (position < 0) {
                    position = 0;
                } else if (position + this.hoverTime.offsetWidth > this.state.trackWidth) {
                    position = this.state.trackWidth - this.hoverTime.offsetWidth;
                }
            }
        }
        return {
            transform: `translateX(${position}px)`,
        };
    }

    private secondsToTime(seconds: number): Time {
        seconds = Math.round(seconds + this.offset);
        const hours: number = Math.floor(seconds / 3600);
        const divForMinutes: number = seconds % 3600;
        const minutes: number = Math.floor(divForMinutes / 60);
        const sec: number = Math.ceil(divForMinutes % 60);
        return {
            hh: hours.toString(),
            mm: minutes < 10 ? "0" + minutes : minutes.toString(),
            ss: sec < 10 ? "0" + sec : sec.toString(),
        };
    }

    private getHoverTime(): string {
        const percent: number = (this.state.seekHoverPosition * 100) / this.state.trackWidth;
        const time: number = Math.floor(+(percent * (this.props.total / 100)));
        const times: Time = this.secondsToTime(time);
        if (this.props.total + this.offset < 60) {
            return this.secondsPrefix + times.ss;
        } else if (this.props.total + this.offset < 3600) {
            return this.minutesPrefix + times.mm + ":" + times.ss;
        } else {
            return times.hh + ":" + times.mm + ":" + times.ss;
        }
    }

    private mouseSeekingHandler = (event: any): void => {
        this.setSeeking(false, event);
        this.onMouseUp();
    };

    private setSeeking = (state: boolean, evt: React.MouseEvent | React.TouchEvent): void => {
        evt.preventDefault();
        this.handleSeeking(evt);
        this.seeking = state;
        this.setState({ seekHoverPosition: !state ? 0 : this.state.seekHoverPosition });
    };

    private mobileTouchSeekingHandler = (): void => {
        this.setMobileSeeking(false);
    };

    private setMobileSeeking = (state: boolean): void => {
        this.mobileSeeking = state;
        this.setState({ seekHoverPosition: !state ? 0 : this.state.seekHoverPosition });
    };

    private isThumbActive(): boolean {
        return this.state.seekHoverPosition > 0 || this.seeking;
    }

    private renderBufferProgress = (): React.ReactNode => {
        if (this.props.buffered) {
            const style = {
                ...this.getPositionStyle(this.props.buffered),
                ...(this.props.bufferColor && { backgroundColor: this.props.bufferColor }),
            };
            return <div className="buffered" style={style} />;
        } else {
            return null;
        }
    };

    private renderProgress = () => {
        const style = {
            ...this.getPositionStyle(this.props.current),
            ...(this.props.sliderColor && { backgroundColor: this.props.sliderColor }),
        };
        return <div className="connect" style={style} />;
    };

    private renderHoverProgress = () => {
        const style = {
            ...this.getSeekHoverPosition(),
            ...(this.props.sliderHoverColor && { backgroundColor: this.props.sliderHoverColor }),
        };
        return <div className="seek-hover" style={style} />;
    };

    private renderThumb = (): React.ReactNode => {
        return (
            <div
                className={this.isThumbActive() ? `thumb active` : "thumb"}
                style={this.getThumbHandlerPosition()}
            >
                <div style={{ backgroundColor: this.props.thumbColor }} className="handler" />
            </div>
        );
    };

    private drawHoverTime(): React.ReactNode {
        if (!this.props.hideHoverTime) {
            return (
                <div
                    className={this.isThumbActive() ? `hover-time active` : "hover-time"}
                    style={this.getHoverTimePosition()}
                    ref={ref => (this.hoverTime = ref)}
                >
                    {this.getHoverTime()}
                </div>
            );
        } else {
            return null;
        }
    }

    private onMouseDown = (event: React.MouseEvent | React.TouchEvent) => {
        if (this.props.pause && !this.props.paused) {
            this.props.pause();
            this.seekPause = true;
        }
        this.setSeeking(true, event);
        this.props.onSeekStart?.();
    };

    private onMouseUp = () => {
        if (this.props.play && this.seekPause) {
            this.props.play();
            this.seekPause = false;
        }
        this.props.onSeekEnd?.();
    };

    public render(): React.ReactNode {
        return (
            <div className="seek-slider">
                <div
                    className="track"
                    ref={ref => (this.track = ref)}
                    onMouseMove={evt => this.handleTrackHover(false, evt)}
                    onMouseLeave={evt => this.handleTrackHover(true, evt)}
                    onMouseDown={this.onMouseDown}
                    onTouchStart={evt => {
                        this.setMobileSeeking(true);
                        this.onMouseDown(evt);
                    }}
                    onMouseUp={this.onMouseUp}
                    onTouchEnd={this.onMouseUp}
                >
                    <div className="main">
                        {this.renderBufferProgress()}
                        {this.renderHoverProgress()}
                        {this.renderProgress()}
                    </div>
                </div>
                {this.drawHoverTime()}
                {this.renderThumb()}
            </div>
        );
    }
}
