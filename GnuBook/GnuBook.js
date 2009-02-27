/*
Copyright(c)2008 Internet Archive. Software license AGPL version 3.

This file is part of GnuBook.

    GnuBook is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    GnuBook is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with GnuBook.  If not, see <http://www.gnu.org/licenses/>.
    
    The GnuBook source is hosted at http://github.com/openlibrary/bookreader/

    archive.org cvs $Revision: 1.64 $ $Date: 2009-01-27 22:31:56 $
*/

// GnuBook()
//______________________________________________________________________________
// After you instantiate this object, you must supply the following
// book-specific functions, before calling init():
//  - getPageWidth()
//  - getPageHeight()	
//  - getPageURI()
//  - getPageSide()
//  - getPageNum()
// You must also add these properties, before calling init():
//  - numLeafs
//  - bookTitle
//  - bookUrl
//
// If you put multiple GnuBook instances on the same page (not in separate IFRAMEs)
// then the instances must be distinguished by distinct instance suffixes. You can
// set the instance suffix either by setting this.instanceSuffix before this.init()
// is called, or by setting GnuBook.nextInstanceSuffix prior to creating the instance.
// The default instance suffix is the empty string. 
//
// If the instance suffix is "XYZ", then the page should include a DIV with id="GnuBookXYZ"
// to hold the book viewer, and may include a search box that invokes _gbXYZ.search() and 
// a search results DIV with id="GnuBookXYZSearchResults". Note that the GnuBook instance
// saves a reference to itself in the global variable _gbXYZ.
//______________________________________________________________________________

function GnuBook() {

	// Set instance suffix based on GnuBook.nextInstanceSuffix value at time of instance creation
	// Alternatively, one could override this setting of instanceSuffix before invoking init()
	this.instanceSuffix = GnuBook.nextInstanceSuffix
	
    this.reduce  = 4;
    this.padding = 10;
    this.mode    = 1; //1 or 2
    
    this.displayedLeafs = [];	
    //this.leafsToDisplay = [];
    this.imgs = {};
    this.prefetchedImgs = {}; //an object with numeric keys cooresponding to leafNum
    
    this.timer     = null;
    this.animating = false;
    this.auto      = false;
    this.autoTimer = null;
    this.flipSpeed = 'fast';

    this.twoPagePopUp = null;
    this.leafEdgeTmp  = null;
    this.embedPopup = null;
    
    this.searchResults = {};
    
    this.firstIndex = null;
    
};
// Instance-distinguishing suffix to be used for next-created GnuBook instance
GnuBook.nextInstanceSuffix = ''

// getBaseDivId() - ID of DIV within which GnuBook instance lives
//______________________________________________________________________________
GnuBook.prototype.getBaseDivId = function() {
	return "GnuBook" + this.instanceSuffix;
};

// getBaseDiv() - DIV within which GnuBook instance lives
//______________________________________________________________________________
GnuBook.prototype.getBaseDiv = function() {
	return $("#" + this.getBaseDivId());
};

// getElementSelector() - Selector for element within GnuBook DIV
//______________________________________________________________________________
GnuBook.prototype.getElementSelector = function(subselector) {
	return "#" + this.getBaseDivId() + " " + subselector;
};

// getElement() - Element within GnuBook DIV
//______________________________________________________________________________
GnuBook.prototype.getElement = function(subselector) {
	return $(this.getElementSelector(subselector))
	// return $(subselector, this.getBaseDiv());
};

// getSearchResultsDiv() - DIV where search results are to appear
//______________________________________________________________________________
GnuBook.prototype.getSearchResultsDiv = function() {
	return $("#" + this.getBaseDivId() + "SearchResults");
};

// getContainerDiv() - DIV for GBcontainer
//______________________________________________________________________________
GnuBook.prototype.getContainerDiv = function() {
	return this.getElement('.GBcontainer');
};

// gbGlobalName() - Name of global variable referencing this GnuBook instance
//______________________________________________________________________________
GnuBook.prototype.gbGlobalName = function() {
	return '_gb' + this.instanceSuffix;
};


// init()
//______________________________________________________________________________
GnuBook.prototype.init = function() {

	// Set appropriate global instance variable so that we can find this object as needed
	window[this.gbGlobalName()] = this
	
    var startLeaf = window.location.hash;
    //console.log("startLeaf from location.hash: %s", startLeaf);
    if ('' == startLeaf) {
        if (this.titleLeaf) {
            startLeaf = "#" + this.leafNumToIndex(this.titleLeaf);
        }
    }
    var title = this.bookTitle.substr(0,50);
    if (this.bookTitle.length>50) title += '...';
    
    // Ideally this would be set in the HTML/PHP for better search engine visibility but
    // it takes some time to locate the item and retrieve the metadata
    document.title = title;
    
    this.getBaseDiv().empty();
    this.getBaseDiv().append("<div class='GBtoolbar'><span style='float:left;'><button class='GBicon' id='zoom_out' onclick='"+this.gbGlobalName()+".zoom1up(-1); return false;'/> <button class='GBicon' id='zoom_in' onclick='"+this.gbGlobalName()+".zoom1up(1); return false;'/> zoom: <span class='GBzoom'>25</span>% <button class='GBicon' id='script' onclick='"+this.gbGlobalName()+".switchMode(1); return false;'/> <button class='GBicon' id='book_open' onclick='"+this.gbGlobalName()+".switchMode(2); return false;'/>  &nbsp;&nbsp; <a href='"+this.bookUrl+"' target='_blank'>"+title+"</a></span></div>");
    this.getElement(".GBtoolbar").append("<span class='GBtoolbarbuttons' style='float: right'><button class='GBicon' id='page_code' onclick='"+this.gbGlobalName()+".showEmbedCode(); return false;'/><form class='GBpageform' action='javascript:' onsubmit='"+this.gbGlobalName()+".jumpToPage(this.elements[0].value)'> page:<input class='GBpagenum' type='text' size='3' onfocus='"+this.gbGlobalName()+".autoStop();'></input></form> <button class='GBicon' id='book_previous' onclick='"+this.gbGlobalName()+".prev(); return false;'/> <button class='GBicon' id='book_next' onclick='"+this.gbGlobalName()+".next(); return false;'/> <button class='GBicon autoImg play' onclick='"+this.gbGlobalName()+".autoToggle(); return false;'/></span>");
    this.getBaseDiv().append("<div class='GBcontainer'></div>");
    this.getContainerDiv().append("<div class='GBpageview'></div>");

    this.getContainerDiv().bind('scroll', this, function(e) {
        e.data.loadLeafs();
    });

    this.setupKeyListeners();

    $(window).bind('resize', this, function(e) {
        //console.log('resize!');
        if (1 == e.data.mode) {
            //console.log('centering 1page view');
            e.data.centerPageView();
            e.data.getElement('.GBpageview').empty()
            e.data.displayedLeafs = [];
            e.data.updateSearchHilites(); //deletes hilights but does not call remove()            
            e.data.loadLeafs();
        } else {
            //console.log('drawing 2 page view');
            e.data.prepareTwoPageView();
        }
    });

    if (1 == this.mode) {
        this.resizePageView();
    
        if ('' != startLeaf) { // Jump to the leaf specified in the URL
            this.jumpToIndex(parseInt(startLeaf.substr(1)));
            //console.log('jump to ' + parseInt(startLeaf.substr(1)));
        }
    } else {
        //this.resizePageView();
        
        this.displayedLeafs=[0];
        if ('' != startLeaf) {
            this.displayedLeafs = [parseInt(startLeaf.substr(1))];
        }
        //console.log('titleLeaf: %d', this.titleLeaf);
        //console.log('displayedLeafs: %s', this.displayedLeafs);
        this.prepareTwoPageView();
        //if (this.auto) this.nextPage();
    }
}

GnuBook.prototype.setupKeyListeners = function() {
    var self = this;

    var KEY_PGUP = 33;
    var KEY_PGDOWN = 34;
    var KEY_END = 35;
    var KEY_HOME = 36;

    var KEY_LEFT = 37;
    var KEY_UP = 38;
    var KEY_RIGHT = 39;
    var KEY_DOWN = 40;

    // We use document here instead of window to avoid a bug in jQuery on IE7
    $(document).keydown(function(e) {
        
        // Keyboard navigation        
        switch(e.keyCode) {
            case KEY_PGUP:
                // In 1up mode page scrolling is handled by browser
                if (2 == self.mode) {
                    self.prev();
                }
                break;
            case KEY_PGDOWN:
                if (2 == self.mode) {
                    self.next();
                }
                break;
            case KEY_END:
                self.end();
                break;
            case KEY_HOME:
                self.home();
                break;
            case KEY_UP:
            case KEY_LEFT:
                if (self.keyboardNavigationIsDisabled(e)) {
                    break;
                }
                if (2 == self.mode) {
                    self.prev();
                }
                break;
            case KEY_DOWN:
            case KEY_RIGHT:
                if (self.keyboardNavigationIsDisabled(e)) {
                    break;
                }
                if (2 == self.mode) {
                    self.next();
                }
                break;
        }
    });
}

// drawLeafs()
//______________________________________________________________________________
GnuBook.prototype.drawLeafs = function() {
    if (1 == this.mode) {
        this.drawLeafsOnePage();
    } else {
        this.drawLeafsTwoPage();
    }
}


// drawLeafsOnePage()
//______________________________________________________________________________
GnuBook.prototype.drawLeafsOnePage = function() {
    //alert('drawing leafs!');
    this.timer = null;


    var scrollTop = this.getContainerDiv().attr('scrollTop');
    var scrollBottom = scrollTop + this.getContainerDiv().height();
    //console.log('top=' + scrollTop + ' bottom='+scrollBottom);
    
    var leafsToDisplay = [];
    
    var i;
    var leafTop = 0;
    var leafBottom = 0;
    for (i=0; i<this.numLeafs; i++) {
        var height  = parseInt(this.getPageHeight(i)/this.reduce); 
    
        leafBottom += height;
        //console.log('leafTop = '+leafTop+ ' pageH = ' + this.pageH[i] + 'leafTop>=scrollTop=' + (leafTop>=scrollTop));
        var topInView    = (leafTop >= scrollTop) && (leafTop <= scrollBottom);
        var bottomInView = (leafBottom >= scrollTop) && (leafBottom <= scrollBottom);
        var middleInView = (leafTop <=scrollTop) && (leafBottom>=scrollBottom);
        if (topInView | bottomInView | middleInView) {
            //console.log('to display: ' + i);
            leafsToDisplay.push(i);
        }
        leafTop += height +10;      
        leafBottom += 10;
    }

    var firstLeafToDraw  = leafsToDisplay[0];
    window.location.replace('#' + firstLeafToDraw);
    this.firstIndex      = firstLeafToDraw;

    if ((0 != firstLeafToDraw) && (1 < this.reduce)) {
        firstLeafToDraw--;
        leafsToDisplay.unshift(firstLeafToDraw);
    }
    
    var lastLeafToDraw = leafsToDisplay[leafsToDisplay.length-1];
    if ( ((this.numLeafs-1) != lastLeafToDraw) && (1 < this.reduce) ) {
        leafsToDisplay.push(lastLeafToDraw+1);
    }
    
    leafTop = 0;
    var i;
    for (i=0; i<firstLeafToDraw; i++) {
        leafTop += parseInt(this.getPageHeight(i)/this.reduce) +10;
    }

    //var viewWidth = this.getElement('.GBpageview').width(); //includes scroll bar width
    var viewWidth = this.getContainerDiv().attr('scrollWidth');


    for (i=0; i<leafsToDisplay.length; i++) {
        var leafNum = leafsToDisplay[i];    
        var height  = parseInt(this.getPageHeight(leafNum)/this.reduce); 

        if(-1 == jQuery.inArray(leafsToDisplay[i], this.displayedLeafs)) {            
            var width   = parseInt(this.getPageWidth(leafNum)/this.reduce); 
            //console.log("displaying leaf " + leafsToDisplay[i] + ' leafTop=' +leafTop);
            var div = document.createElement("div");
            //div.className = 'GBpagediv1up';
            //div.id = 'pagediv'+leafNum;
            div.className = 'GBpagediv1up pagediv'+leafNum;
            div.style.position = "absolute";
            $(div).css('top', leafTop + 'px');
            var left = (viewWidth-width)>>1;
            if (left<0) left = 0;
            $(div).css('left', left+'px');
            $(div).css('width', width+'px');
            $(div).css('height', height+'px');
            //$(div).text('loading...');
            
            this.getElement('.GBpageview').append(div);

            var img = document.createElement("img");
            img.src = this.getPageURI(leafNum);
            $(img).css('width', width+'px');
            $(img).css('height', height+'px');
            $(div).append(img);

        } else {
            //console.log("not displaying " + leafsToDisplay[i] + ' score=' + jQuery.inArray(leafsToDisplay[i], this.displayedLeafs));            
        }

        leafTop += height +10;

    }
    
    for (i=0; i<this.displayedLeafs.length; i++) {
        if (-1 == jQuery.inArray(this.displayedLeafs[i], leafsToDisplay)) {
            var leafNum = this.displayedLeafs[i];
            //console.log('Removing leaf ' + leafNum);
            //console.log('id='+'.pagediv'+leafNum+ ' top = ' +this.getElement('.pagediv'+leafNum).css('top'));
            this.getElement('.pagediv'+leafNum).remove();
        } else {
            //console.log('NOT Removing leaf ' + this.displayedLeafs[i]);
        }
    }
    
    this.displayedLeafs = leafsToDisplay.slice();
    this.updateSearchHilites();
    
    if (null != this.getPageNum(firstLeafToDraw))  {
        this.getElement(".GBpagenum").val(this.getPageNum(firstLeafToDraw));
    } else {
        this.getElement(".GBpagenum").val('');
    }
}

// drawLeafsTwoPage()
//______________________________________________________________________________
GnuBook.prototype.drawLeafsTwoPage = function() {
    //alert('drawing two leafs!');

    var scrollTop = this.getContainerDiv().attr('scrollTop');
    var scrollBottom = scrollTop + this.getContainerDiv().height();
    var leafNum = this.currentLeafL;
    var height  = this.getPageHeight(leafNum); 
    var width   = this.getPageWidth(leafNum);
    var handSide= this.getPageSide(leafNum);

    var leafEdgeWidthL = parseInt( (leafNum/this.numLeafs)*this.twoPageEdgeW );
    var leafEdgeWidthR = this.twoPageEdgeW - leafEdgeWidthL;
    var divWidth = this.twoPageW*2+20 + this.twoPageEdgeW;
    var divLeft = (this.getContainerDiv().width() - divWidth) >> 1;
    //console.log(leafEdgeWidthL);

    var middle = (this.getContainerDiv().width() >> 1);            
    var left = middle - this.twoPageW;
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    var scaledW = parseInt(this.twoPageH*width/height);
    left = 10+leafEdgeWidthL;
    //var right = left+scaledW;
    var right = $(this.twoPageDiv).width()-11-$(this.leafEdgeL).width()-scaledW;

    var gutter = middle+parseInt((2*this.currentLeafL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);
    
    
    this.prefetchImg(leafNum);
    $(this.prefetchedImgs[leafNum]).css({
        position: 'absolute',
        /*right:   gutter+'px',*/
        left: gutter-scaledW+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH +'px',
        width:  scaledW + 'px',
        borderRight: '1px solid black',
        zIndex: 2
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append(this.prefetchedImgs[leafNum]);


    var leafNum = this.currentLeafR;
    var height  = this.getPageHeight(leafNum); 
    var width   = this.getPageWidth(leafNum);
    //    var left = (this.getContainerDiv().width() >> 1);
    left += scaledW;

    var scaledW = this.twoPageH*width/height;
    this.prefetchImg(leafNum);
    $(this.prefetchedImgs[leafNum]).css({
        position: 'absolute',
        left:   gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH + 'px',
        width:  scaledW + 'px',
        borderLeft: '1px solid black',
        zIndex: 2
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append(this.prefetchedImgs[leafNum]);
        

    this.displayedLeafs = [this.currentLeafL, this.currentLeafR];
    this.setClickHandlers();

    this.updatePageNumBox2UP();
}

// updatePageNumBox2UP
//______________________________________________________________________________
GnuBook.prototype.updatePageNumBox2UP = function() {
    if (null != this.getPageNum(this.currentLeafL))  {
        this.getElement(".GBpagenum").val(this.getPageNum(this.currentLeafL));
    } else {
        this.getElement(".GBpagenum").val('');
    }
    window.location.replace('#' + this.currentLeafL); 
}

// loadLeafs()
//______________________________________________________________________________
GnuBook.prototype.loadLeafs = function() {


    var self = this;
    if (null == this.timer) {
        this.timer=setTimeout(function(){self.drawLeafs()},250);
    } else {
        clearTimeout(this.timer);
        this.timer=setTimeout(function(){self.drawLeafs()},250);    
    }
}


// zoom1up()
//______________________________________________________________________________
GnuBook.prototype.zoom1up = function(dir) {
    if (2 == this.mode) {     //can only zoom in 1-page mode
        this.switchMode(1);
        return;
    }
    
    if (1 == dir) {
        if (this.reduce <= 0.5) return;
        this.reduce*=0.5;           //zoom in
    } else {
        if (this.reduce >= 8) return;
        this.reduce*=2;             //zoom out
    }
    
    this.resizePageView();

    this.getElement('.GBpageview').empty()
    this.displayedLeafs = [];
    this.loadLeafs();
    
    this.getElement('.GBzoom').text(100/this.reduce);
}


// resizePageView()
//______________________________________________________________________________
GnuBook.prototype.resizePageView = function() {
    var i;
    var viewHeight = 0;
    //var viewWidth  = this.getContainerDiv().width(); //includes scrollBar
    var viewWidth  = this.getContainerDiv().attr('clientWidth');   

    var oldScrollTop  = this.getContainerDiv().attr('scrollTop');
    var oldViewHeight = this.getElement('.GBpageview').height();
    if (0 != oldViewHeight) {
        var scrollRatio = oldScrollTop / oldViewHeight;
    } else {
        var scrollRatio = 0;
    }
    
    for (i=0; i<this.numLeafs; i++) {
        viewHeight += parseInt(this.getPageHeight(i)/this.reduce) + this.padding; 
        var width = parseInt(this.getPageWidth(i)/this.reduce);
        if (width>viewWidth) viewWidth=width;
    }
    this.getElement('.GBpageview').height(viewHeight);
    this.getElement('.GBpageview').width(viewWidth);    

    this.getContainerDiv().attr('scrollTop', Math.floor(scrollRatio*viewHeight));
    
    this.centerPageView();
    this.loadLeafs();
    
}

// centerPageView()
//______________________________________________________________________________
GnuBook.prototype.centerPageView = function() {

    var scrollWidth  = this.getContainerDiv().attr('scrollWidth');
    var clientWidth  =  this.getContainerDiv().attr('clientWidth');
    //console.log('sW='+scrollWidth+' cW='+clientWidth);
    if (scrollWidth > clientWidth) {
        this.getContainerDiv().attr('scrollLeft', (scrollWidth-clientWidth)/2);
    }

}

// jumpToPage()
//______________________________________________________________________________
GnuBook.prototype.jumpToPage = function(pageNum) {
    //if (2 == this.mode) return;
    
    var i;
    var foundPage = false;
    var foundLeaf = null;
    for (i=0; i<this.numLeafs; i++) {
        if (this.getPageNum(i) == pageNum) {
            foundPage = true;
            foundLeaf = i;
            break;
        }
    }
    
    if (foundPage) {
        var leafTop = 0;
        var h;
        this.jumpToIndex(foundLeaf);
        this.getContainerDiv().attr('scrollTop', leafTop);
    } else {
        alert('Page not found. This book might not have pageNumbers in scandata.');
    }
}

// jumpToIndex()
//______________________________________________________________________________
GnuBook.prototype.jumpToIndex = function(index) {
    if (2 == this.mode) {
        this.autoStop();
        if (index<this.currentLeafL) {
            if ('L' == this.getPageSide(index)) {
                this.flipBackToIndex(index);
            } else {
                this.flipBackToIndex(index-1);
            }
        } else if (index>this.currentLeafR) {
            if ('R' == this.getPageSide(index)) {
                this.flipFwdToIndex(index);
            } else {
                this.flipFwdToIndex(index+1);
            }        
        }

    } else {        
        var i;
        var leafTop = 0;
        var h;
        for (i=0; i<index; i++) {
            h = parseInt(this.getPageHeight(i)/this.reduce); 
            leafTop += h + this.padding;
        }
        //this.getContainerDiv().attr('scrollTop', leafTop);
        this.getContainerDiv().animate({scrollTop: leafTop },'fast');    
    }
}



// switchMode()
//______________________________________________________________________________
GnuBook.prototype.switchMode = function(mode) {
    if (mode == this.mode) return;

    this.autoStop();
    this.removeSearchHilites();

    this.mode = mode;
    if (1 == mode) {
        this.prepareOnePageView();
    } else {
        this.prepareTwoPageView();
    }

}

//prepareOnePageView()
//______________________________________________________________________________
GnuBook.prototype.prepareOnePageView = function() {

    var startLeaf = this.displayedLeafs[0];
    
    this.getContainerDiv().empty();
    this.getContainerDiv().css({
        overflowY: 'scroll',
        overflowX: 'auto'
    });
    
    this.getContainerDiv().append("<div class='GBpageview'></div>");
    this.resizePageView();
    this.jumpToIndex(startLeaf);
    this.displayedLeafs = [];    
    this.drawLeafsOnePage();
    this.getElement('.GBzoom').text(100/this.reduce);    
}

// prepareTwoPageView()
//______________________________________________________________________________
GnuBook.prototype.prepareTwoPageView = function() {
    this.getContainerDiv().empty();

    var firstLeaf = this.displayedLeafs[0];
    if ('R' == this.getPageSide(firstLeaf)) {
        if (0 == firstLeaf) {
            firstLeaf++;
        } else {
            firstLeaf--;
        }
    }

    this.currentLeafL = null;
    this.currentLeafR = null;
    this.pruneUnusedImgs();
    
    this.currentLeafL = firstLeaf;
    this.currentLeafR = firstLeaf + 1;
    
    this.calculateSpreadSize(); //sets this.twoPageW, twoPageH, and twoPageRatio

    var middle = (this.getContainerDiv().width() >> 1);
    var gutter = middle+parseInt((2*this.currentLeafL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);
    var scaledWL = this.getPageWidth2UP(this.currentLeafL);
    var scaledWR = this.getPageWidth2UP(this.currentLeafR);
    var leafEdgeWidthL = parseInt( (firstLeaf/this.numLeafs)*this.twoPageEdgeW );
    var leafEdgeWidthR = this.twoPageEdgeW - leafEdgeWidthL;

    //console.log('idealWidth='+idealWidth+' idealHeight='+idealHeight);
    //var divWidth = this.twoPageW*2+20 + this.twoPageEdgeW;
    var divWidth = scaledWL + scaledWR + 20 + this.twoPageEdgeW;
    var divHeight = this.twoPageH+20;
    //var divLeft = (this.getContainerDiv().width() - divWidth) >> 1;
    var divLeft = gutter-scaledWL-leafEdgeWidthL-10;
    var divTop = (this.getContainerDiv().height() - divHeight) >> 1;
    //console.log('divWidth='+divWidth+' divHeight='+divHeight+ ' divLeft='+divLeft+' divTop='+divTop);

    this.twoPageDiv = document.createElement('div');
    $(this.twoPageDiv).attr('id', 'book_div_1').css({
        border: '1px solid rgb(68, 25, 17)',
        width:  divWidth + 'px',
        height: divHeight+'px',
        visibility: 'visible',
        position: 'absolute',
        backgroundColor: 'rgb(136, 51, 34)',
        left: divLeft + 'px',
        top: divTop+'px',
        MozBorderRadiusTopleft: '7px',
        MozBorderRadiusTopright: '7px',
        MozBorderRadiusBottomright: '7px',
        MozBorderRadiusBottomleft: '7px'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append('<div id="book_div_1" style="border: 1px solid rgb(68, 25, 17); width: ' + divWidth + 'px; height: '+divHeight+'px; visibility: visible; position: absolute; background-color: rgb(136, 51, 34); left: ' + divLeft + 'px; top: '+divTop+'px; -moz-border-radius-topleft: 7px; -moz-border-radius-topright: 7px; -moz-border-radius-bottomright: 7px; -moz-border-radius-bottomleft: 7px;"/>');


    var height  = this.getPageHeight(this.currentLeafR); 
    var width   = this.getPageWidth(this.currentLeafR);    
    var scaledW = this.twoPageH*width/height;
    
    this.leafEdgeR = document.createElement('div');
    $(this.leafEdgeR).css({
        borderStyle: 'solid solid solid none',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 1px 1px 0px',
        background: 'transparent url(images/right-edges.png) repeat scroll 0% 0%',
        width: leafEdgeWidthR + 'px',
        height: this.twoPageH-1 + 'px',
        /*right: '10px',*/
        left: gutter+scaledW+'px',
        top: divTop+10+'px',
        position: 'absolute'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    
    this.leafEdgeL = document.createElement('div');
    $(this.leafEdgeL).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeWidthL + 'px',
        height: this.twoPageH-1 + 'px',
        left: divLeft+10+'px',
        top: divTop+10+'px',    
        position: 'absolute'
    }).appendTo(this.getElementSelector('.GBcontainer'));



    divWidth = 30;
    divHeight = this.twoPageH+20;
    divLeft = (this.getContainerDiv().width() - divWidth) >> 1;
    divTop = (this.getContainerDiv().height() - divHeight) >> 1;

    div = document.createElement('div');
    $(div).attr('id', 'book_div_2').css({
        border:          '1px solid rgb(68, 25, 17)',
        width:           divWidth+'px',
        height:          divHeight+'px',
        position:        'absolute',
        backgroundColor: 'rgb(68, 25, 17)',
        left:            divLeft+'px',
        top:             divTop+'px'
    }).appendTo(this.getElementSelector('.GBcontainer'));
    //this.getContainerDiv().append('<div id="book_div_2" style="border: 1px solid rgb(68, 25, 17); width: '+divWidth+'px; height: '+divHeight+'px; visibility: visible; position: absolute; background-color: rgb(68, 25, 17); left: '+divLeft+'px; top: '+divTop+'px;"/>');

    divWidth = this.twoPageW*2;
    divHeight = this.twoPageH;
    divLeft = (this.getContainerDiv().width() - divWidth) >> 1;
    divTop = (this.getContainerDiv().height() - divHeight) >> 1;


    this.prepareTwoPagePopUp();

    this.displayedLeafs = [];
    //this.leafsToDisplay=[firstLeaf, firstLeaf+1];
    //console.log('leafsToDisplay: ' + this.leafsToDisplay[0] + ' ' + this.leafsToDisplay[1]);
    this.drawLeafsTwoPage();
    this.updateSearchHilites2UP();
    
    this.prefetch();
    this.getElement('.GBzoom').text((100*this.twoPageH/this.getPageHeight(firstLeaf)).toString().substr(0,4));
}

// prepareTwoPagePopUp()
//
// This function prepares the "View leaf n" popup that shows while the mouse is
// over the left/right "stack of sheets" edges.  It also binds the mouse
// events for these divs.
//______________________________________________________________________________
GnuBook.prototype.prepareTwoPagePopUp = function() {
    this.twoPagePopUp = document.createElement('div');
    $(this.twoPagePopUp).css({
        border: '1px solid black',
        padding: '2px 6px',
        position: 'absolute',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        zIndex: '1000',
        backgroundColor: 'rgb(255, 255, 238)',
        opacity: 0.85
    }).appendTo(this.getElementSelector('.GBcontainer'));
    $(this.twoPagePopUp).hide();
    
    $(this.leafEdgeL).add(this.leafEdgeR).bind('mouseenter', this, function(e) {
        $(e.data.twoPagePopUp).show();
    });

    $(this.leafEdgeL).add(this.leafEdgeR).bind('mouseleave', this, function(e) {
        $(e.data.twoPagePopUp).hide();
    });

    $(this.leafEdgeL).bind('click', this, function(e) { 
        e.data.autoStop();
        var jumpIndex = e.data.currentLeafL - ($(e.data.leafEdgeL).offset().left + $(e.data.leafEdgeL).width() - e.pageX) * 10;
        jumpIndex = Math.max(jumpIndex, 0);
        e.data.flipBackToIndex(jumpIndex);
    
    });

    $(this.leafEdgeR).bind('click', this, function(e) { 
        e.data.autoStop();
        var jumpIndex = e.data.currentLeafR + (e.pageX - $(e.data.leafEdgeR).offset().left) * 10;
        jumpIndex = Math.max(jumpIndex, 0);
        e.data.flipFwdToIndex(jumpIndex);
    
    });

    $(this.leafEdgeR).bind('mousemove', this, function(e) {

        var jumpLeaf = e.data.currentLeafR + (e.pageX - $(e.data.leafEdgeR).offset().left) * 10;
        jumpLeaf = Math.min(jumpLeaf, e.data.numLeafs-1);        
        $(e.data.twoPagePopUp).text('View Leaf '+jumpLeaf);
        
        $(e.data.twoPagePopUp).css({
            left: e.pageX +5+ 'px',
            top: e.pageY-e.data.getContainerDiv().offset().top+ 'px'
        });
    });

    $(this.leafEdgeL).bind('mousemove', this, function(e) {
        var jumpLeaf = e.data.currentLeafL - ($(e.data.leafEdgeL).offset().left + $(e.data.leafEdgeL).width() - e.pageX) * 10;
        jumpLeaf = Math.max(jumpLeaf, 0);
        $(e.data.twoPagePopUp).text('View Leaf '+jumpLeaf);
        
        $(e.data.twoPagePopUp).css({
            left: e.pageX - $(e.data.twoPagePopUp).width() - 30 + 'px',
            top: e.pageY-e.data.getContainerDiv().offset().top+ 'px'
        });
    });
}

// calculateSpreadSize()
//______________________________________________________________________________
// Calculates 2-page spread dimensions based on this.currentLeafL and
// this.currentLeafR
// This function sets this.twoPageH, twoPageW, and twoPageRatio

GnuBook.prototype.calculateSpreadSize = function() {
    var firstLeaf  = this.currentLeafL;
    var secondLeaf = this.currentLeafR;
    //console.log('first page is ' + firstLeaf);

    var canon5Dratio = 1.5;
    
    var firstLeafRatio  = this.getPageHeight(firstLeaf) / this.getPageWidth(firstLeaf);
    var secondLeafRatio = this.getPageHeight(secondLeaf) / this.getPageWidth(secondLeaf);
    //console.log('firstLeafRatio = ' + firstLeafRatio + ' secondLeafRatio = ' + secondLeafRatio);

    var ratio;
    if (Math.abs(firstLeafRatio - canon5Dratio) < Math.abs(secondLeafRatio - canon5Dratio)) {
        ratio = firstLeafRatio;
        //console.log('using firstLeafRatio ' + ratio);
    } else {
        ratio = secondLeafRatio;
        //console.log('using secondLeafRatio ' + ratio);
    }

    var totalLeafEdgeWidth = parseInt(this.numLeafs * 0.1);
    var maxLeafEdgeWidth   = parseInt(this.getContainerDiv().width() * 0.1);
    totalLeafEdgeWidth     = Math.min(totalLeafEdgeWidth, maxLeafEdgeWidth);
    
    this.getContainerDiv().css('overflow', 'hidden');

    var idealWidth  = (this.getContainerDiv().width() - 30 - totalLeafEdgeWidth)>>1;
    var idealHeight = this.getContainerDiv().height() - 30;
    //console.log('init idealWidth='+idealWidth+' idealHeight='+idealHeight + ' ratio='+ratio);

    if (idealHeight/ratio <= idealWidth) {
        //use height
        idealWidth = parseInt(idealHeight/ratio);
    } else {
        //use width
        idealHeight = parseInt(idealWidth*ratio);
    }

    this.twoPageH     = idealHeight;
    this.twoPageW     = idealWidth;
    this.twoPageRatio = ratio;
    this.twoPageEdgeW = totalLeafEdgeWidth;    

}

// next()
//______________________________________________________________________________
GnuBook.prototype.next = function() {
    if (2 == this.mode) {
        this.autoStop();
        this.flipFwdToIndex(null);
    } else {
        if (this.firstIndex <= (this.numLeafs - 2)) {
            this.jumpToIndex(this.firstIndex+1);
        }
    }
}

// prev()
//______________________________________________________________________________
GnuBook.prototype.prev = function() {
    if (2 == this.mode) {
        this.autoStop();
        this.flipBackToIndex(null);
    } else {
        if (this.firstIndex >= 1) {
            this.jumpToIndex(this.firstIndex-1);
        }    
    }
}

GnuBook.prototype.home = function() {
    if (2 == this.mode) {
        this.jumpToIndex(2);
    }
    else {
        this.jumpToIndex(0);
    }
}

GnuBook.prototype.end = function() {
    if (2 == this.mode) {
        this.jumpToIndex(this.numLeafs-5);
    }
    else {
        this.jumpToIndex(this.numLeafs-1);
    }
}

// flipBackToIndex()
//______________________________________________________________________________
// to flip back one spread, pass index=null
GnuBook.prototype.flipBackToIndex = function(index) {
    if (1 == this.mode) return;

    var leftIndex = this.currentLeafL;
    if (leftIndex <= 2) return;
    if (this.animating) return;

    if (null != this.leafEdgeTmp) {
        alert('error: leafEdgeTmp should be null!');
        return;
    }
    
    if (null == index) {
        index = leftIndex-2;
    }
    if (index<0) return;

    if ('L' !=  this.getPageSide(index)) {
        alert('img with index ' + index + ' is not a left-hand page');
        return;
    }

    this.animating = true;
    
    var prevL = index;
    var prevR = index+1;

    var gutter= this.prepareFlipBack(prevL, prevR);

    var leftLeaf = this.currentLeafL;

    var oldLeafEdgeWidthL = parseInt( (this.currentLeafL/this.numLeafs)*this.twoPageEdgeW );
    var newLeafEdgeWidthL = parseInt( (index            /this.numLeafs)*this.twoPageEdgeW );    
    var leafEdgeTmpW = oldLeafEdgeWidthL - newLeafEdgeWidthL;

    var scaledWL = this.getPageWidth2UP(prevL);

    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    this.leafEdgeTmp = document.createElement('div');
    $(this.leafEdgeTmp).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeTmpW + 'px',
        height: this.twoPageH-1 + 'px',
        left: gutter-scaledWL+10+newLeafEdgeWidthL+'px',
        top: top+'px',    
        position: 'absolute',
        zIndex:1000
    }).appendTo(this.getElementSelector('.GBcontainer'));
    
    //$(this.leafEdgeL).css('width', newLeafEdgeWidthL+'px');
    $(this.leafEdgeL).css({
        width: newLeafEdgeWidthL+'px', 
        left: gutter-scaledWL-newLeafEdgeWidthL+'px'
    });   

    var left = $(this.prefetchedImgs[leftLeaf]).offset().left;
    var right = this.getContainerDiv().width()-left-$(this.prefetchedImgs[leftLeaf]).width()+this.getContainerDiv().offset().left-2+'px';
    $(this.prefetchedImgs[leftLeaf]).css({
        right: right,
        left: null
    });

     left = $(this.prefetchedImgs[leftLeaf]).offset().left - $('#book_div_1').offset().left;
     right = left+$(this.prefetchedImgs[leftLeaf]).width()+'px';

    $(this.leafEdgeTmp).animate({left: gutter}, this.flipSpeed, 'easeInSine');    
    //$(this.prefetchedImgs[leftLeaf]).animate({width: '0px'}, 'slow', 'easeInSine');

    var scaledWR = this.getPageWidth2UP(prevR);
    
    var self = this;

    this.removeSearchHilites();

    $(this.prefetchedImgs[leftLeaf]).animate({width: '0px'}, self.flipSpeed, 'easeInSine', function() {
        $(self.leafEdgeTmp).animate({left: gutter+scaledWR+'px'}, self.flipSpeed, 'easeOutSine');    
        $(self.prefetchedImgs[prevR]).animate({width: scaledWR+'px'}, self.flipSpeed, 'easeOutSine', function() {
            $(self.prefetchedImgs[prevL]).css('zIndex', 2);

            $(self.leafEdgeR).css({
                width: self.twoPageEdgeW-newLeafEdgeWidthL+'px',
                left:  gutter+scaledWR+'px'
            });
            
            $(self.twoPageDiv).css({
                width: scaledWL+scaledWR+self.twoPageEdgeW+20+'px',
                left: gutter-scaledWL-newLeafEdgeWidthL-10+'px'
            });
            
            $(self.leafEdgeTmp).remove();
            self.leafEdgeTmp = null;
            
            self.currentLeafL = prevL;
            self.currentLeafR = prevR;
            self.displayedLeafs = [prevL, prevR];
            self.setClickHandlers();
            self.pruneUnusedImgs();
            self.prefetch();
            self.animating = false;
            
            self.updateSearchHilites2UP();
            self.updatePageNumBox2UP();
            //this.getElement('.GBzoom').text((self.twoPageH/self.getPageHeight(prevL)).toString().substr(0,4));            
        });
    });        
    
}

// flipFwdToIndex()
//______________________________________________________________________________
// to flip forward one spread, pass index=null
GnuBook.prototype.flipFwdToIndex = function(index) {
    var rightLeaf = this.currentLeafR;
    if (rightLeaf >= this.numLeafs-3) return;

    if (this.animating) return;

    if (null != this.leafEdgeTmp) {
        alert('error: leafEdgeTmp should be null!');
        return;
    }

    
    if (null == index) {
        index = rightLeaf+2;
    }
    if (index>=this.numLeafs-3) return;

    if ('R' !=  this.getPageSide(index)) {
        alert('img with index ' + index + ' is not a right-hand page');
        return;
    }

    this.animating = true;

    var nextL = index-1;
    var nextR = index;

    var gutter= this.prepareFlipFwd(nextL, nextR);

    var oldLeafEdgeWidthL = parseInt( (this.currentLeafL/this.numLeafs)*this.twoPageEdgeW );
    var oldLeafEdgeWidthR = this.twoPageEdgeW-oldLeafEdgeWidthL;
    var newLeafEdgeWidthL = parseInt( (nextL            /this.numLeafs)*this.twoPageEdgeW );    
    var newLeafEdgeWidthR = this.twoPageEdgeW-newLeafEdgeWidthL;

    var leafEdgeTmpW = oldLeafEdgeWidthR - newLeafEdgeWidthR;

    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                

    var height  = this.getPageHeight(rightLeaf); 
    var width   = this.getPageWidth(rightLeaf);    
    var scaledW = this.twoPageH*width/height;

    var middle     = (this.getContainerDiv().width() >> 1);
    var currGutter = middle+parseInt((2*this.currentLeafL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);    

    this.leafEdgeTmp = document.createElement('div');
    $(this.leafEdgeTmp).css({
        borderStyle: 'solid none solid solid',
        borderColor: 'rgb(51, 51, 34)',
        borderWidth: '1px 0px 1px 1px',
        background: 'transparent url(images/left-edges.png) repeat scroll 0% 0%',
        width: leafEdgeTmpW + 'px',
        height: this.twoPageH-1 + 'px',
        left: currGutter+scaledW+'px',
        top: top+'px',    
        position: 'absolute',
        zIndex:1000
    }).appendTo(this.getElementSelector('.GBcontainer'));

    var scaledWR = this.getPageWidth2UP(nextR);
    $(this.leafEdgeR).css({width: newLeafEdgeWidthR+'px', left: gutter+scaledWR+'px' });

    var scaledWL = this.getPageWidth2UP(nextL);
    
    var self = this;

    var speed = this.flipSpeed;

    this.removeSearchHilites();
    
    $(this.leafEdgeTmp).animate({left: gutter}, speed, 'easeInSine');    
    $(this.prefetchedImgs[rightLeaf]).animate({width: '0px'}, speed, 'easeInSine', function() {
        $(self.leafEdgeTmp).animate({left: gutter-scaledWL-leafEdgeTmpW+'px'}, speed, 'easeOutSine');    
        $(self.prefetchedImgs[nextL]).animate({width: scaledWL+'px'}, speed, 'easeOutSine', function() {
            $(self.prefetchedImgs[nextR]).css('zIndex', 2);

            $(self.leafEdgeL).css({
                width: newLeafEdgeWidthL+'px', 
                left: gutter-scaledWL-newLeafEdgeWidthL+'px'
            });
            
            $(self.twoPageDiv).css({
                width: scaledWL+scaledWR+self.twoPageEdgeW+20+'px',
                left: gutter-scaledWL-newLeafEdgeWidthL-10+'px'
            });
            
            $(self.leafEdgeTmp).remove();
            self.leafEdgeTmp = null;
            
            self.currentLeafL = nextL;
            self.currentLeafR = nextR;
            self.displayedLeafs = [nextL, nextR];
            self.setClickHandlers();            
            self.pruneUnusedImgs();
            self.prefetch();
            self.animating = false;

            self.updateSearchHilites2UP();
            self.updatePageNumBox2UP();
            //this.getElement('.GBzoom').text((self.twoPageH/self.getPageHeight(nextL)).toString().substr(0,4));
        });
    });
    
}

// setClickHandlers
//______________________________________________________________________________
GnuBook.prototype.setClickHandlers = function() {
    var self = this;
    $(this.prefetchedImgs[this.currentLeafL]).click(function() {
        //self.prevPage();
        self.autoStop();
        self.flipBackToIndex(null);
    });
    $(this.prefetchedImgs[this.currentLeafR]).click(function() {
        //self.nextPage();'
        self.autoStop();
        self.flipFwdToIndex(null);        
    });
}

// prefetchImg()
//______________________________________________________________________________
GnuBook.prototype.prefetchImg = function(leafNum) {
    if (undefined == this.prefetchedImgs[leafNum]) {        
        var img = document.createElement("img");
        img.src = this.getPageURI(leafNum);
        this.prefetchedImgs[leafNum] = img;
    }
}


// prepareFlipBack()
//______________________________________________________________________________
GnuBook.prototype.prepareFlipBack = function(prevL, prevR) {

    this.prefetchImg(prevL);
    this.prefetchImg(prevR);
    
    var height  = this.getPageHeight(prevL); 
    var width   = this.getPageWidth(prevL);    
    var middle = (this.getContainerDiv().width() >> 1);
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
    var scaledW = this.twoPageH*width/height;

    var gutter = middle+parseInt((2*prevL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);    

    $(this.prefetchedImgs[prevL]).css({
        position: 'absolute',
        /*right:   middle+'px',*/
        left: gutter-scaledW+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  scaledW+'px',
        borderRight: '1px solid black',
        zIndex: 1
    });

    this.getContainerDiv().append(this.prefetchedImgs[prevL]);

    $(this.prefetchedImgs[prevR]).css({
        position: 'absolute',
        left:   gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  '0px',
        borderLeft: '1px solid black',
        zIndex: 2
    });

    this.getContainerDiv().append(this.prefetchedImgs[prevR]);


    return gutter;
            
}

// prepareFlipFwd()
//______________________________________________________________________________
GnuBook.prototype.prepareFlipFwd = function(nextL, nextR) {

    this.prefetchImg(nextL);
    this.prefetchImg(nextR);

    var height  = this.getPageHeight(nextR); 
    var width   = this.getPageWidth(nextR);    
    var middle = (this.getContainerDiv().width() >> 1);
    var top  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
    var scaledW = this.twoPageH*width/height;

    var gutter = middle+parseInt((2*nextL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);    
    
    $(this.prefetchedImgs[nextR]).css({
        position: 'absolute',
        left:   gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  scaledW+'px',
        borderLeft: '1px solid black',
        zIndex: 1
    });

    this.getContainerDiv().append(this.prefetchedImgs[nextR]);

    height  = this.getPageHeight(nextL); 
    width   = this.getPageWidth(nextL);      
    scaledW = this.twoPageH*width/height;

    $(this.prefetchedImgs[nextL]).css({
        position: 'absolute',
        right:   this.getContainerDiv().width()-gutter+'px',
        top:    top+'px',
        backgroundColor: 'rgb(234, 226, 205)',
        height: this.twoPageH,
        width:  0+'px',
        borderRight: '1px solid black',
        zIndex: 2
    });

    this.getContainerDiv().append(this.prefetchedImgs[nextL]);    

    return gutter;
            
}

// getNextLeafs()
//______________________________________________________________________________
GnuBook.prototype.getNextLeafs = function(o) {
    //TODO: we might have two left or two right leafs in a row (damaged book)
    //For now, assume that leafs are contiguous.
    
    //return [this.currentLeafL+2, this.currentLeafL+3];
    o.L = this.currentLeafL+2;
    o.R = this.currentLeafL+3;
}

// getprevLeafs()
//______________________________________________________________________________
GnuBook.prototype.getPrevLeafs = function(o) {
    //TODO: we might have two left or two right leafs in a row (damaged book)
    //For now, assume that leafs are contiguous.
    
    //return [this.currentLeafL-2, this.currentLeafL-1];
    o.L = this.currentLeafL-2;
    o.R = this.currentLeafL-1;
}

// pruneUnusedImgs()
//______________________________________________________________________________
GnuBook.prototype.pruneUnusedImgs = function() {
    //console.log('current: ' + this.currentLeafL + ' ' + this.currentLeafR);
    for (var key in this.prefetchedImgs) {
        //console.log('key is ' + key);
        if ((key != this.currentLeafL) && (key != this.currentLeafR)) {
            //console.log('removing key '+ key);
            $(this.prefetchedImgs[key]).remove();
        }
        if ((key < this.currentLeafL-4) || (key > this.currentLeafR+4)) {
            //console.log('deleting key '+ key);
            delete this.prefetchedImgs[key];
        }
    }
}

// prefetch()
//______________________________________________________________________________
GnuBook.prototype.prefetch = function() {

    var lim = this.currentLeafL-4;
    var i;
    lim = Math.max(lim, 0);
    for (i = lim; i < this.currentLeafL; i++) {
        this.prefetchImg(i);
    }
    
    if (this.numLeafs > (this.currentLeafR+1)) {
        lim = Math.min(this.currentLeafR+4, this.numLeafs-1);
        for (i=this.currentLeafR+1; i<=lim; i++) {
            this.prefetchImg(i);
        }
    }
}

// getPageWidth2UP()
//______________________________________________________________________________
GnuBook.prototype.getPageWidth2UP = function(index) {
    var height  = this.getPageHeight(index); 
    var width   = this.getPageWidth(index);    
    return Math.floor(this.twoPageH*width/height);
}    

// search()
//______________________________________________________________________________
GnuBook.prototype.search = function(term) {
    $('#' + this.getBaseDivId() + 'SearchScript').remove();
 	var script  = document.createElement("script");
 	script.setAttribute('id', this.getBaseDivId() + 'SearchScript');
	script.setAttribute("type", "text/javascript");
	script.setAttribute("src", 'http://'+this.server+'/GnuBook/flipbook_search_gb.php?url='+escape(this.bookPath+'/'+this.bookId+'_djvu.xml')+'&term='+term+'&format=XML&callback='+this.gbGlobalName()+'.GBSearchCallback');
	document.getElementsByTagName('head')[0].appendChild(script);
}

// GBSearchCallback()
//______________________________________________________________________________
GnuBook.prototype.GBSearchCallback = function(txt) {
    //alert(txt);
    if (jQuery.browser.msie) {
        var dom=new ActiveXObject("Microsoft.XMLDOM");
        dom.async="false";
        dom.loadXML(txt);    
    } else {
        var parser = new DOMParser();
        var dom = parser.parseFromString(txt, "text/xml");    
    }
    
    this.getSearchResultsDiv().empty();    
    this.getSearchResultsDiv().append('<ul>');
    
    for (var key in this.searchResults) {
        if (null != this.searchResults[key].div) {
            $(this.searchResults[key].div).remove();
        }
        delete this.searchResults[key];
    }
    
    var pages = dom.getElementsByTagName('PAGE');
    
    if (0 == pages.length) {
        // $$$ it would be nice to echo the (sanitized) search result here
        this.getSearchResultsDiv().append('<li>No search results found</li>');
    } else {    
        for (var i = 0; i < pages.length; i++){
            //console.log(pages[i].getAttribute('file').substr(1) +'-'+ parseInt(pages[i].getAttribute('file').substr(1), 10));
    
            
            var re = new RegExp (/_(\d{4})/);
            var reMatch = re.exec(pages[i].getAttribute('file'));
            var leafNum = parseInt(reMatch[1], 10);
            //var leafNum = parseInt(pages[i].getAttribute('file').substr(1), 10);
            
            var children = pages[i].childNodes;
            var context = '';
            for (var j=0; j<children.length; j++) {
                //console.log(j + ' - ' + children[j].nodeName);
                //console.log(children[j].firstChild.nodeValue);
                if ('CONTEXT' == children[j].nodeName) {
                    context += children[j].firstChild.nodeValue;
                } else if ('WORD' == children[j].nodeName) {
                    context += '<b>'+children[j].firstChild.nodeValue+'</b>';
                    
                    var index = this.leafNumToIndex(leafNum);
                    if (null != index) {
                        //coordinates are [left, bottom, right, top, [baseline]]
                        //we'll skip baseline for now...
                        var coords = children[j].getAttribute('coords').split(',',4);
                        if (4 == coords.length) {
                            this.searchResults[index] = {'l':coords[0], 'b':coords[1], 'r':coords[2], 't':coords[3], 'div':null};
                        }
                    }
                }
            }
            this.getSearchResultsDiv().append('<li><b><a href="javascript:'+this.gbGlobalName()+'.jumpToIndex('+index+');">Leaf ' + leafNum + '</a></b> - ' + context+'</li>');
        }
    }
    this.getSearchResultsDiv().append('</ul>');

    this.updateSearchHilites();
}

// updateSearchHilites()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites = function() {
    if (2 == this.mode) {
        this.updateSearchHilites2UP();
    } else {
        this.updateSearchHilites1UP();
    }
}

// showSearchHilites1UP()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites1UP = function() {

    for (var key in this.searchResults) {
        
        if (-1 != jQuery.inArray(parseInt(key), this.displayedLeafs)) {
            var result = this.searchResults[key];
            if(null == result.div) {
                result.div = document.createElement('div');
                $(result.div).attr('className', 'GnuBookSearchHilite').appendTo(this.getElementSelector('.pagediv'+key));
                //console.log('appending ' + key);
            }    
            $(result.div).css({
                width:  (result.r-result.l)/this.reduce + 'px',
                height: (result.b-result.t)/this.reduce + 'px',
                left:   (result.l)/this.reduce + 'px',
                top:    (result.t)/this.reduce +'px'
            });

        } else {
            //console.log(key + ' not displayed');
            this.searchResults[key].div=null;
        }
    }
}

// showSearchHilites2UP()
//______________________________________________________________________________
GnuBook.prototype.updateSearchHilites2UP = function() {

    var middle = (this.getContainerDiv().width() >> 1);

    for (var key in this.searchResults) {
        key = parseInt(key, 10);
        if (-1 != jQuery.inArray(key, this.displayedLeafs)) {
            var result = this.searchResults[key];
            if(null == result.div) {
                result.div = document.createElement('div');
                $(result.div).attr('className', 'GnuBookSearchHilite').css('zIndex', 3).appendTo(this.getElementSelector('.GBcontainer'));
                //console.log('appending ' + key);
            }

            var height = this.getPageHeight(key);
            var width  = this.getPageWidth(key)
            var reduce = this.twoPageH/height;
            var scaledW = parseInt(width*reduce);
            
            var gutter = middle+parseInt((2*this.currentLeafL - this.numLeafs)*this.twoPageEdgeW/this.numLeafs/2);
            
            if ('L' == this.getPageSide(key)) {
                var pageL = gutter-scaledW;
            } else {
                var pageL = gutter;
            }
            var pageT  = (this.getContainerDiv().height() - this.twoPageH) >> 1;                
                        
            $(result.div).css({
                width:  (result.r-result.l)*reduce + 'px',
                height: (result.b-result.t)*reduce + 'px',
                left:   pageL+(result.l)*reduce + 'px',
                top:    pageT+(result.t)*reduce +'px'
            });

        } else {
            //console.log(key + ' not displayed');
            if (null != this.searchResults[key].div) {
                //console.log('removing ' + key);
                $(this.searchResults[key].div).remove();
            }
            this.searchResults[key].div=null;
        }
    }
}

// removeSearchHilites()
//______________________________________________________________________________
GnuBook.prototype.removeSearchHilites = function() {
    for (var key in this.searchResults) {
        if (null != this.searchResults[key].div) {
            $(this.searchResults[key].div).remove();
            this.searchResults[key].div=null;
        }        
    }
}

// showEmbedCode()
//______________________________________________________________________________
GnuBook.prototype.showEmbedCode = function() {
    if (null != this.embedPopup) { // check if already showing
        return;
    }
    this.autoStop();
    this.embedPopup = document.createElement("div");
    $(this.embedPopup).css({
        position: 'absolute',
        top:      '20px',
        left:     (this.getContainerDiv().width()-400)/2 + 'px',
        width:    '400px',
        padding:  "20px",
        border:   "3px double #999999",
        zIndex:   3,
        backgroundColor: "#fff"
    }).appendTo(this.getElementSelector(''));

    htmlStr =  '<p style="text-align:center;"><b>Embed Bookreader in your blog!</b></p>';
    htmlStr += '<p><b>Note:</b> The bookreader is still in beta testing. URLs may change in the future, breaking embedded books. This feature is just for testing!</b></p>';
    htmlStr += '<p>The bookreader uses iframes for embedding. It will not work on web hosts that block iframes. The embed feature has been tested on blogspot.com blogs as well as self-hosted Wordpress blogs. This feature will NOT work on wordpress.com blogs.</p>';
    htmlStr += '<p>Embed Code: <input type="text" size="40" value="<iframe src=\'http://www.us.archive.org/GnuBook/GnuBookEmbed.php?id='+this.bookId+'\' width=\'430px\' height=\'430px\'></iframe>"></p>';
    htmlStr += '<p style="text-align:center;"><a href="" onclick="'+this.gbGlobalName()+'.embedPopup = null; $(this.parentNode.parentNode).remove(); return false">Close popup</a></p>';    

    this.embedPopup.innerHTML = htmlStr;    
}

// autoToggle()
//______________________________________________________________________________
GnuBook.prototype.autoToggle = function() {
    if (2 != this.mode) {
        this.switchMode(2);
    }

    var self = this;
    if (null == this.autoTimer) {
        this.flipSpeed = 2000;
        this.flipFwdToIndex();

        this.getElement('.autoImg').removeClass('play').addClass('pause');
        this.autoTimer=setInterval(function(){
            if (self.animating) {return;}

            if (self.currentLeafR >= self.numLeafs-5) {
                self.flipBackToIndex(1);
            } else {
                self.flipFwdToIndex();
            }
        },5000);
    } else {
        this.autoStop();
    }
}

// autoStop()
//______________________________________________________________________________
GnuBook.prototype.autoStop = function() {
    if (null != this.autoTimer) {
        clearInterval(this.autoTimer);
        this.flipSpeed = 'fast';
        $('.autoImg').removeClass('pause').addClass('play');
        this.autoTimer = null;
    }
}

// keyboardNavigationIsDisabled(event)
//   - returns true if keyboard navigation should be disabled for the event
//______________________________________________________________________________

GnuBook.prototype.keyboardNavigationIsDisabled = function(event) {
    if (event.target.tagName == "INPUT") {
        return true;
    }   
    return false;
}